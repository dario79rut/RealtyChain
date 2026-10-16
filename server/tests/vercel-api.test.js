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

test('deleted seed listings are not resurrected by the next request', async () => {
  const authenticated = await login();
  const id = state().properties[0].id;
  const removed = await request(`/api/properties/${id}`, { method: 'DELETE', token: authenticated.data.token });
  assert.equal(removed.status, 200);
  assert.equal((await request('/health')).status, 200);
  assert.equal(state().properties.some((property) => property.id === id), false);
});
