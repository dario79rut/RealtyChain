const { test } = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../storage/blobs');

// Shared fake backing store with independent service instances, as on Netlify.
const stores = new Map();
let failing = false;
storage.skipFsWrites = () => true;
storage.getBlobStore = async (name, options) => {
  assert.equal(options.consistency, 'strong');
  if (!stores.has(name)) stores.set(name, new Map());
  const values = stores.get(name);
  return {
    async get(key, opts) {
      if (failing) throw new Error('storage outage');
      assert.equal(opts.consistency, 'strong');
      const value = values.get(key);
      return value && opts.type === 'json' ? JSON.parse(value) : value || null;
    },
    async set(key, value) {
      if (failing) throw new Error('storage outage');
      values.set(key, value);
    },
    async list({ prefix }) {
      if (failing) throw new Error('storage outage');
      return { blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
};
function instance() {
  delete require.cache[require.resolve('../services/settingsService')];
  return require('../services/settingsService');
}
const request = (ip) => ({ headers: { 'x-nf-client-connection-ip': ip } });

test('saved IP is immediately accepted by another function instance', async () => {
  const writer = instance();
  const reader = instance();
  const req = request('198.51.100.71');
  assert.equal(await reader.isRequestIpAllowed(req), false);
  assert.equal((await writer.allowCurrentIp(req)).ipAllowed, true);
  assert.equal(await reader.isRequestIpAllowed(req), true);
  await writer.setAllowedIps([], req);
  assert.equal(await reader.isRequestIpAllowed(req), false);
});

test('IP normalization handles mapped IPv4, equivalent IPv6 and proxy chains', () => {
  const service = instance();
  assert.equal(service.getClientIp(request('::ffff:203.0.113.7')), '203.0.113.7');
  assert.equal(service.getClientIp(request('2001:0db8:0000:0000:0000:0000:0000:0001')), '2001:db8::1');
  assert.equal(service.getClientIp({ headers: {
    'x-nf-client-connection-ip': '203.0.113.8',
    'x-forwarded-for': '198.51.100.2, 10.0.0.1',
  } }), '203.0.113.8');
  assert.equal(service.getClientIp({ headers: {
    'client-ip': 'invalid', 'x-forwarded-for': 'bad, 203.0.113.9, 10.0.0.1',
  } }), '203.0.113.9');
});

test('concurrent logins persist across cold starts and retain earlier successes', async () => {
  const first = instance();
  const second = instance();
  await Promise.all([
    first.recordLoginAttempt(request('203.0.113.11'), { email: 'one@example.com', result: 'signed-in' }),
    second.recordLoginAttempt(request('203.0.113.12'), { email: 'two@example.com', result: 'signed-in' }),
  ]);
  await first.recordLoginAttempt(request('203.0.113.11'), { email: 'one@example.com', result: 'rejected' });
  const out = await instance().getSettings(request('203.0.113.11'));
  assert.equal(out.loginAttempts.length, 2);
  assert.equal(out.recentLogins.length, 2);
  assert.deepEqual(new Set(out.recentLogins.map((row) => row.email)), new Set(['one@example.com', 'two@example.com']));
  assert.equal(out.recentLogins.find((row) => row.ip === '203.0.113.11').result, 'signed-in');
});

test('settings read errors never authorize from a stale in-memory allowlist', async () => {
  const service = instance();
  const req = request('198.51.100.72');
  await service.allowCurrentIp(req);
  failing = true;
  try {
    await assert.rejects(service.isRequestIpAllowed(req), { status: 503 });
  } finally {
    failing = false;
  }
});

test('missing blob credentials never fall back to local files on Netlify', async () => {
  const original = storage.getBlobStore;
  // A newly loaded instance captures the unavailable store provider.
  storage.getBlobStore = async () => null;
  try {
    await assert.rejects(instance().allowCurrentIp(request('203.0.113.80')), { status: 503 });
  } finally {
    storage.getBlobStore = original;
  }
});


test('a failed settings write is not acknowledged or cached', async () => {
  const original = storage.getBlobStore;
  storage.getBlobStore = async (name, options) => {
    const store = await original(name, options);
    if (name === 'server-settings') store.set = async () => { throw new Error('write failed'); };
    return store;
  };
  try {
    const service = instance();
    await assert.rejects(service.allowCurrentIp(request('203.0.113.81')), /write failed/);
  } finally {
    storage.getBlobStore = original;
  }
  assert.equal(await instance().isRequestIpAllowed(request('203.0.113.81')), false);
});
