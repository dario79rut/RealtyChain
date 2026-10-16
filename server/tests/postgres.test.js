const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { randomUUID } = require('crypto');

if (!process.env.TEST_DATABASE_URL) {
  test('PostgreSQL integration (set TEST_DATABASE_URL to a temporary local database)', { skip: true }, () => {});
} else {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Integration tests require a local disposable database');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATA_STORAGE_PROVIDER = 'postgres';
  process.env.DATA_NAMESPACE = `test-${randomUUID()}`;
  process.env.STORAGE_PROVIDER = 'vercel';
  process.env.VERCEL = '1';
  process.env.BLOB_PREFIX = 'postgres-test-files';
  process.env.ALLOWED_LOGIN_IPS = '127.0.0.1';
  const { fakeVercel } = require('./helpers/fakeVercel');
  const sdk = fakeVercel();
  sdk.beforePut = async (path) => {
    assert.ok(!/\/(app-data|server-settings|login-activity)\//.test(path), 'Records must never be written to Blob');
  };
  const installed = require('@vercel/blob');
  for (const key of ['get', 'put', 'list', 'del']) installed[key] = sdk[key];
  const app = require('../app');
  const persistence = require('../mock/persistence');
  const { pool } = require('../db');
  const { beginTransaction, withTransaction, createPostgresStore } = require('../storage/postgres');
  const store = createPostgresStore('app-data');
  const namespace = process.env.DATA_NAMESPACE;
  let server;
  let base;
  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.query('DELETE FROM realtychain_records WHERE namespace = $1', [namespace]);
    await pool.end();
  });
  async function request(path, { method = 'GET', body, token, ip = '127.0.0.1' } = {}) {
    const response = await fetch(`${base}${path}`, { method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip,
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  const login = (email = 'test1@gmail.com', password = 'pass1234', ip) => request('/api/auth/login', {
    method: 'POST', body: { email, password }, ip });
  const saved = () => withTransaction(() => store.get('data.json', { type: 'json' }));

  test('initializes PostgreSQL records and loads Market, Lend and Govern without Blob record writes', async () => {
    assert.equal((await request('/health')).status, 200);
    const user = await login();
    assert.equal(user.status, 200);
    const results = await Promise.all(['/api/market', '/api/lend', '/api/governance'].map((path) => request(path, { token: user.data.token })));
    assert.deepEqual(results.map((result) => result.status), [200, 200, 200]);
    const data = await saved();
    assert.ok(data.market.orders.length);
    assert.ok(data.lending);
    assert.ok(data.governance.length);
    assert.equal(sdk.calls.filter((call) => call.method === 'put').length, 0);
  });

  test('preserves all users across overlapping registration requests', async () => {
    const emails = Array.from({ length: 6 }, (_, index) => `pg-${index}@example.com`);
    const results = await Promise.all(emails.map((email) => request('/api/auth/register', {
      method: 'POST', body: { email, password: 'test-password' } })));
    assert.ok(results.every((result) => result.status === 201));
    const data = await saved();
    assert.ok(emails.every((email) => data.users.some((user) => user.email === email)));
  });

  test('separate database connections serialize snapshot changes instead of rejecting them', async () => {
    const first = await beginTransaction();
    let secondRead = false;
    const second = (async () => {
      const transaction = await beginTransaction();
      try {
        await transaction.run(async () => {
          secondRead = true;
          const data = await store.get('data.json', { type: 'json' });
          data.concurrentCounter += 1;
          await store.set('data.json', JSON.stringify(data));
        });
        await transaction.commit();
      } finally { transaction.release(); }
    })();
    try {
      await first.run(async () => {
        const data = await store.get('data.json', { type: 'json' });
        data.concurrentCounter = 1;
        await store.set('data.json', JSON.stringify(data));
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.equal(secondRead, false, 'Second connection must wait for the first transaction');
      });
      await first.commit();
    } finally { first.release(); }
    await second;
    assert.equal((await saved()).concurrentCounter, 2);
  });

  test('stores allowed IPs and successful and blocked login activity in PostgreSQL', async () => {
    const ip = '203.0.113.77';
    assert.equal((await login('test1@gmail.com', 'pass1234', ip)).status, 403);
    const blocked = await request('/api/settings');
    assert.equal(blocked.data.loginAttempts.find((row) => row.ip === ip).result, 'blocked');
    assert.equal((await request('/api/settings/allow-current-ip', { method: 'POST', body: {}, ip })).status, 200);
    assert.equal((await login('test1@gmail.com', 'pass1234', ip)).status, 200);
    const settings = await request('/api/settings');
    assert.ok(settings.data.allowedAdminIps.includes(ip));
    assert.ok(settings.data.recentLogins.some((row) => row.ip === ip));
    const rows = await pool.query('SELECT DISTINCT store_name FROM realtychain_records WHERE namespace = $1', [namespace]);
    assert.deepEqual(rows.rows.map((row) => row.store_name).sort(), ['app-data', 'login-activity', 'server-settings']);
  });

  test('a rejected action discards partial balance changes', async () => {
    const user = await login();
    const before = await saved();
    const lending = require('../services/lendingService');
    const original = lending.supply;
    lending.supply = (id) => {
      persistence.data.users.find((row) => String(row.id) === String(id)).cashCents -= 100;
      persistence.save();
      throw Object.assign(new Error('Rejected after mutation'), { status: 400 });
    };
    try {
      assert.equal((await request('/api/lend/supply', { method: 'POST', body: { usdc: 1 }, token: user.data.token })).status, 400);
    } finally { lending.supply = original; }
    assert.deepEqual((await saved()).users, before.users);
  });

  test('failed storage commits roll back SQL login history writes', async () => {
    const before = await pool.query('SELECT record_key, value FROM realtychain_records WHERE namespace = $1 AND store_name = $2 ORDER BY record_key', [namespace, 'login-activity']);
    const original = persistence.commit;
    persistence.commit = async () => { throw new Error('Simulated commit failure'); };
    try { assert.equal((await login()).status, 503); }
    finally { persistence.commit = original; }
    const after = await pool.query('SELECT record_key, value FROM realtychain_records WHERE namespace = $1 AND store_name = $2 ORDER BY record_key', [namespace, 'login-activity']);
    assert.deepEqual(after.rows, before.rows);
  });

  test('file uploads still use private Blob storage while records stay in PostgreSQL', async () => {
    const user = await login('admin@defi.estate', 'admin1234');
    const uploaded = await request('/api/images', { method: 'POST', token: user.data.token,
      body: { filename: 'pixel.png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=' } });
    assert.equal(uploaded.status, 201);
    assert.ok(sdk.values.has(`postgres-test-files/listing-images/${uploaded.data.filename}`));
  });

  test('database record transactions roll back on exceptions', async () => {
    const before = await saved();
    await assert.rejects(withTransaction(async () => {
      await store.set('data.json', '{"users":[],"properties":[]}');
      throw new Error('Rollback test');
    }), /Rollback test/);
    assert.deepEqual(await saved(), before);
  });

  test('Blob record migration supports a dry run, refuses replacement, and backs up explicit replacements', async () => {
    const { migrateRecords } = require('../db/migrate');
    const originalNamespace = process.env.DATA_NAMESPACE;
    const destination = `${namespace}-migration`;
    const imported = {
      'app-data': { 'data.json': { users: [{ id: 99, email: 'imported@example.com' }], properties: [] } },
      'server-settings': { settings: { allowedAdminIps: ['203.0.113.1'] } },
      'login-activity': { 'addresses/example/signed-in': { ip: '203.0.113.1', result: 'signed-in' } },
    };
    const source = (name) => ({
      list: async () => ({ blobs: Object.keys(imported[name]).map((key) => ({ key })) }),
      get: async (key) => JSON.stringify(imported[name][key]),
    });
    let backupNamespace;
    process.env.DATA_NAMESPACE = destination;
    try {
      const dry = await migrateRecords({ source });
      assert.equal(dry.applied, false);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM realtychain_records WHERE namespace = $1', [destination])).rows[0].count, 0);
      assert.equal((await migrateRecords({ source, apply: true })).applied, true);
      assert.deepEqual(await saved(), imported['app-data']['data.json']);
      await assert.rejects(migrateRecords({ source, apply: true }), /Destination already contains/);
      const previous = structuredClone(imported['app-data']['data.json']);
      imported['app-data']['data.json'].users[0].name = 'Changed source';
      const replaced = await migrateRecords({ source, apply: true, replaceExisting: true });
      backupNamespace = replaced.backupNamespace;
      assert.ok(backupNamespace);
      assert.deepEqual(await saved(), imported['app-data']['data.json']);
      const backup = await pool.query('SELECT value FROM realtychain_records WHERE namespace = $1 AND store_name = $2 AND record_key = $3', [backupNamespace, 'app-data', 'data.json']);
      assert.deepEqual(backup.rows[0].value, previous);
      assert.equal(sdk.calls.filter((call) => call.method === 'put' && /app-data/.test(call.path)).length, 0);
    } finally {
      process.env.DATA_NAMESPACE = originalNamespace;
      await pool.query('DELETE FROM realtychain_records WHERE namespace = ANY($1::text[])', [[destination, backupNamespace].filter(Boolean)]);
    }
  });


  test('Netlify function initializes PostgreSQL inside its request transaction', async () => {
    const { handler } = require('../../netlify/functions/api');
    const result = await handler({
      httpMethod: 'GET', path: '/health', headers: { 'x-nf-client-connection-ip': '127.0.0.1' },
      queryStringParameters: null, body: null, isBase64Encoded: false,
      requestContext: { identity: { sourceIp: '127.0.0.1' } },
    }, {});
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.parse(result.body).status, 'ok');
  });

}
