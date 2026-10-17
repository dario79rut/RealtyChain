const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { fakeVercel } = require('./helpers/fakeVercel');

// No real Blob credentials or network access: exercise the actual app and
// adapter against a shared fake backing service.
process.env.STORAGE_PROVIDER = 'vercel';
process.env.VERCEL = '1';
process.env.BLOB_PREFIX = 'test';
process.env.ALLOWED_LOGIN_IPS = '';
const sdk = fakeVercel();
const installed = require('@vercel/blob');
for (const key of ['get', 'put', 'del', 'list', 'BlobPreconditionFailedError']) installed[key] = sdk[key];
const app = require('../../api/index');
const statePath = 'test/app-data/data.json';
const state = () => JSON.parse(sdk.values.get(statePath).bytes.toString());
let server;
let base;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

async function request(path, { method = 'GET', body, token, ip = '127.0.0.1' } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip,
      'X-Nf-Client-Connection-Ip': '198.51.100.200', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
async function login(email = 'admin@defi.estate', password = 'admin1234', ip) {
  return request('/api/auth/login', { method: 'POST', body: { email, password }, ip });
}

test('Vercel API initializes private data and persists allowlist and login activity', async () => {
  assert.equal((await request('/health')).status, 200);
  assert.ok(state().users.length >= 4);
  const ip = '203.0.113.77';
  assert.equal((await login('test1@gmail.com', 'pass1234', ip)).status, 403);
  const allowed = await request('/api/settings/allow-current-ip', { method: 'POST', body: {}, ip });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.data.currentIp, ip);
  assert.equal(allowed.data.ipAllowed, true);
  assert.equal((await login('test1@gmail.com', 'pass1234', ip)).status, 200);
  const settings = await request('/api/settings');
  assert.equal(settings.data.recentLogins.find((row) => row.ip === ip).email, 'test1@gmail.com');
  assert.ok(sdk.values.has('test/server-settings/settings'));
});

test('warm API requests reload externally updated data', async () => {
  const authenticated = await login('test1@gmail.com', 'pass1234');
  const external = state();
  external.users.find((user) => user.email === 'test1@gmail.com').name = 'Updated elsewhere';
  sdk.write(statePath, JSON.stringify(external));
  const me = await request('/api/auth/me', { token: authenticated.data.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.name, 'Updated elsewhere');
});

test('uploads finish before success and remain readable without an instance cache', async () => {
  const authenticated = await login();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
  const uploaded = await request('/api/images', { method: 'POST', token: authenticated.data.token,
    body: { filename: 'test.png', data: png } });
  assert.equal(uploaded.status, 201);
  assert.ok(sdk.values.has(`test/listing-images/${uploaded.data.filename}`));
  delete require.cache[require.resolve('../services/imageService')];
  const coldImages = require('../services/imageService');
  assert.deepEqual((await coldImages.readUpload(uploaded.data.filename)).buffer, Buffer.from(png, 'base64'));
});

test('failed uploads return a storage error instead of a successful URL', async () => {
  const authenticated = await login();
  sdk.beforePut = async (path) => { if (path.startsWith('test/listing-images/')) throw new Error('Upload offline'); };
  try {
    const result = await request('/api/images', { method: 'POST', token: authenticated.data.token,
      body: { filename: 'bad.png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' } });
    assert.equal(result.status, 503);
    assert.equal(result.data.url, undefined);
  } finally { sdk.beforePut = null; }
});

test('a concurrent snapshot write produces 409 instead of overwriting new data', async () => {
  sdk.beforePut = async (path) => {
    if (path === statePath) {
      sdk.beforePut = null;
      sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: true }));
    }
  };
  try {
    const result = await request('/api/auth/register', { method: 'POST',
      body: { email: 'conflict@example.com', password: 'test-password' } });
    assert.equal(result.status, 409);
    assert.equal(state().concurrentMarker, true);
    assert.equal(state().users.some((user) => user.email === 'conflict@example.com'), false);
  } finally { sdk.beforePut = null; }
});

test('storage read failure never overwrites existing data with seeds', async () => {
  const before = sdk.values.get(statePath).bytes.toString();
  sdk.failReads = true;
  try { assert.equal((await request('/health')).status, 503); }
  finally { sdk.failReads = false; }
  assert.equal(sdk.values.get(statePath).bytes.toString(), before);
  assert.equal((await request('/health')).status, 200);
});

test('overlapping requests in one instance preserve both updates', async () => {
  const responses = await Promise.all(['first', 'second'].map((name) => request('/api/auth/register', {
    method: 'POST', body: { email: `${name}@example.com`, password: 'test-password' },
  })));
  assert.deepEqual(responses.map((response) => response.status), [201, 201]);
  const emails = state().users.map((user) => user.email);
  assert.ok(emails.includes('first@example.com'));
  assert.ok(emails.includes('second@example.com'));
});

test('vault files stay protected and are deleted only after the metadata commit succeeds', async () => {
  const authenticated = await login();
  const token = authenticated.data.token;
  const id = state().properties[0].id;
  const bytes = Buffer.from('%PDF-1.1\n%%EOF\n');
  const upload = await request(`/api/properties/${id}/documents`, { method: 'POST', token,
    body: { name: 'Private test document', filename: 'private.pdf', data: bytes.toString('base64') } });
  assert.equal(upload.status, 201);
  const documents = upload.data.property.documents;
  const doc = documents[documents.length - 1];
  const key = `test/vault-files/${doc.url.slice('/api/vault/'.length)}`;
  assert.ok(sdk.values.has(key));
  assert.equal((await request(doc.url)).status, 401);
  const downloaded = await fetch(`${base}${doc.url}`, { headers: {
    Authorization: `Bearer ${token}`, 'X-Forwarded-For': '127.0.0.1',
  } });
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  delete require.cache[require.resolve('../services/vaultService')];
  const coldVault = require('../services/vaultService');
  assert.deepEqual(await coldVault.readPropertyFile(id, doc.url.split('/').pop()), bytes);

  sdk.beforePut = async (path) => {
    if (path === statePath) {
      sdk.beforePut = null;
      sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: 'vault' }));
    }
  };
  const removeUrl = `/api/properties/${id}/documents/${documents.length - 1}`;
  try {
    assert.equal((await request(removeUrl, { method: 'DELETE', token })).status, 409);
    assert.ok(sdk.values.has(key), 'A rejected metadata commit must not delete the file');
  } finally { sdk.beforePut = null; }
  assert.equal((await request(removeUrl, { method: 'DELETE', token })).status, 200);
  assert.equal(sdk.values.has(key), false);
});

test('existing hosted catalog documents upgrade once without losing uploads or restoring removed samples', async () => {
  const authenticated = await login();
  const token = authenticated.data.token;
  const external = state();
  const property = external.properties.find((row) => row.id === '6');
  delete property.sampleDocumentsVersion;
  property.documents = [
    { name: 'Property Deed', url: '/api/vault/seed/6-deed.pdf' },
    { name: 'Historic Designation', url: '/api/vault/seed/6-financials.pdf' },
    { name: 'Renovation Permits', url: '/api/vault/seed/6-financials.pdf' },
    { name: 'Uploaded insurance', url: '/api/vault/6/insurance.pdf' },
  ];
  sdk.write(statePath, JSON.stringify(external));
  const refreshed = await request('/api/properties/6', { token });
  assert.equal(refreshed.status, 200);
  assert.deepEqual(refreshed.data.property.documents.map((doc) => doc.name),
    ['Property Deed', 'Financial Projections', 'Uploaded insurance', 'Inspection Report']);
  assert.equal(state().properties.find((row) => row.id === '6').sampleDocumentsVersion, 2);
  assert.equal(refreshed.data.property.documents[0].url, '/api/vault/seed/sample-deed.pdf');
  const removed = await request('/api/properties/6/documents/3', { method: 'DELETE', token });
  assert.equal(removed.status, 200);
  const next = await request('/api/properties/6', { token });
  assert.equal(next.data.property.documents.some((doc) => doc.name === 'Inspection Report'), false);
  assert.equal((await request('/api/vault/seed/6-deed.pdf')).status, 401);
  const pdf = await fetch(`${base}/api/vault/seed/6-deed.pdf`, { headers: {
    Authorization: `Bearer ${token}`, 'X-Forwarded-For': '127.0.0.1',
  } });
  assert.equal(pdf.status, 200);
  assert.match(Buffer.from(await pdf.arrayBuffer()).toString('latin1'), /\/Count 2\b/);
});

test('deleted seed listings are not resurrected by the next request', async () => {
  const authenticated = await login();
  const id = state().properties[0].id;
  const removed = await request(`/api/properties/${id}`, { method: 'DELETE', token: authenticated.data.token });
  assert.equal(removed.status, 200);
  assert.equal((await request('/health')).status, 200);
  assert.equal(state().properties.some((property) => property.id === id), false);
});

test('opening Market retries a competing update and preserves the newer snapshot', async () => {
  const authenticated = await login('test1@gmail.com', 'pass1234');
  let conflicts = 0;
  sdk.beforePut = async (path) => {
    if (path === statePath && conflicts === 0) {
      conflicts += 1;
      sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: 'market-open' }));
    }
  };
  try {
    const market = await request('/api/market', { token: authenticated.data.token });
    assert.equal(market.status, 200);
    assert.ok(market.data.quotes.length > 0);
    assert.equal(conflicts, 1);
    assert.equal(state().concurrentMarker, 'market-open');
    assert.ok(state().market.orders.length > 0);
    const writes = sdk.calls.filter((call) => call.method === 'put' && call.path === statePath).length;
    assert.equal((await request('/api/market', { token: authenticated.data.token })).status, 200);
    assert.equal(sdk.calls.filter((call) => call.method === 'put' && call.path === statePath).length, writes);
  } finally { sdk.beforePut = null; }
});

test('Market setup stops retrying under sustained contention and recovers afterward', async () => {
  const authenticated = await login('test1@gmail.com', 'pass1234');
  const uninitialized = state();
  delete uninitialized.market;
  sdk.write(statePath, JSON.stringify(uninitialized));
  let conflicts = 0;
  sdk.beforePut = async (path) => {
    if (path === statePath) {
      conflicts += 1;
      sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: `busy-${conflicts}` }));
    }
  };
  try {
    const market = await request('/api/market', { token: authenticated.data.token });
    assert.equal(market.status, 409);
    assert.equal(conflicts, 4);
    assert.equal(state().market, undefined, 'Failed attempts must not replace newer data');
    assert.equal(state().concurrentMarker, 'busy-4');
  } finally { sdk.beforePut = null; }
  assert.equal((await request('/api/market', { token: authenticated.data.token })).status, 200);
});

test('an order submission is not automatically replayed when its commit conflicts', async () => {
  const authenticated = await login('test1@gmail.com', 'pass1234');
  const original = state();
  const property = original.properties[0];
  const count = original.market.orders.length;
  let attempts = 0;
  sdk.beforePut = async (path) => {
    if (path === statePath) {
      attempts += 1;
      sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: 'order-conflict' }));
    }
  };
  try {
    const order = await request('/api/market/orders', { method: 'POST', token: authenticated.data.token,
      body: { propertyId: String(property.id), side: 'bid', price: 1, shares: 1, open: true } });
    assert.equal(order.status, 409);
    assert.equal(attempts, 1);
    assert.equal(state().market.orders.length, count);
    assert.equal(state().concurrentMarker, 'order-conflict');
  } finally { sdk.beforePut = null; }
});

for (const view of [
  { name: 'Lend', key: 'lending', path: '/api/lend' },
  { name: 'Govern', key: 'governance', path: '/api/governance?propertyId=3' },
]) {
  test(`opening ${view.name} recovers from a competing setup write`, async () => {
    const authenticated = await login('test1@gmail.com', 'pass1234');
    const uninitialized = state();
    delete uninitialized[view.key];
    sdk.write(statePath, JSON.stringify(uninitialized));
    let conflicts = 0;
    sdk.beforePut = async (path) => {
      if (path === statePath && conflicts === 0) {
        conflicts += 1;
        sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: `${view.name}-open` }));
      }
    };
    try {
      const response = await request(view.path, { token: authenticated.data.token });
      assert.equal(response.status, 200);
      assert.equal(conflicts, 1);
      assert.equal(state().concurrentMarker, `${view.name}-open`);
      assert.ok(state()[view.key]);
      if (view.key === 'lending') assert.ok(response.data.poolUsdc > 0);
      else {
        assert.ok(response.data.proposals.length > 0);
        assert.ok(response.data.proposals.every((proposal) => proposal.propertyId === '3'));
      }
      const writes = sdk.calls.filter((call) => call.method === 'put' && call.path === statePath).length;
      assert.equal((await request(view.path, { token: authenticated.data.token })).status, 200);
      assert.equal(sdk.calls.filter((call) => call.method === 'put' && call.path === statePath).length, writes,
        'An unchanged view should not write the shared snapshot again');
    } finally { sdk.beforePut = null; }
  });
}

for (const action of [
  { name: 'Lend supply', path: '/api/lend/supply', body: { usdc: 1 } },
  { name: 'Govern vote', path: '/api/governance/gov-manager/vote', body: { choice: 'for' } },
]) {
  test(`${action.name} is not replayed after a conflicting commit`, async () => {
    const authenticated = await login('test1@gmail.com', 'pass1234');
    const before = state();
    let attempts = 0;
    sdk.beforePut = async (path) => {
      if (path === statePath) {
        attempts += 1;
        sdk.write(statePath, JSON.stringify({ ...state(), concurrentMarker: action.name }));
      }
    };
    try {
      const result = await request(action.path, { method: 'POST', token: authenticated.data.token, body: action.body });
      assert.equal(result.status, 409);
      assert.equal(attempts, 1);
      assert.deepEqual(state().lending, before.lending);
      assert.deepEqual(state().governance, before.governance);
      assert.deepEqual(state().users, before.users);
    } finally { sdk.beforePut = null; }
  });
}

test('Lend still commits accrued interest once when a read needs conflict recovery', async () => {
  const authenticated = await login('test1@gmail.com', 'pass1234');
  const original = state();
  const user = original.users.find((row) => row.email === 'test1@gmail.com');
  delete original.lending.rateState; // Exercise migration from the historical fixed-rate model.
  original.lending.supplies = [{ userId: user.id, principalCents: 1_000_000, accruedCents: 0,
    updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() }];
  sdk.write(statePath, JSON.stringify(original));
  let conflicts = 0;
  sdk.beforePut = async (path) => {
    if (path === statePath && conflicts === 0) {
      conflicts += 1;
      const latest = state();
      latest.users.find((row) => row.id === user.id).cashCents += 100;
      sdk.write(statePath, JSON.stringify(latest));
    }
  };
  try {
    const desk = await request('/api/lend', { token: authenticated.data.token });
    assert.equal(desk.status, 200);
    assert.equal(conflicts, 1);
    assert.equal(desk.data.supply.interest, 400);
    assert.equal(state().lending.supplies[0].accruedCents, 40_000);
    assert.equal(desk.data.cashUsdc, (user.cashCents + 100) / 100);
    const refreshed = await request('/api/lend', { token: authenticated.data.token });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.data.supply.interest, 400);
    assert.equal(state().lending.supplies[0].accruedCents, 40_000);
  } finally { sdk.beforePut = null; }
});
