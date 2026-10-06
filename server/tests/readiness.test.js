const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const readiness = require('../services/readiness');
const app = require('../app');

test('demo snapshot leaves audit, bounty, and first close open', async () => {
  const snap = await readiness.snapshot();
  assert.equal(snap.demo, true);
  assert.equal(snap.liveOfferingAllowed, false);
  const byId = Object.fromEntries(snap.checks.map((c) => [c.id, c]));
  assert.equal(byId.audit.status, 'open');
  assert.equal(byId.bounty.status, 'open');
  assert.equal(byId['first-close'].status, 'open');
  assert.equal(byId.kyc.status, 'open');
});

test('production startup blockers require jwt, rpc, and the Solana program', () => {
  const prev = {
    APP_ENV: process.env.APP_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
    VITE_SOLANA_RPC_URL: process.env.VITE_SOLANA_RPC_URL,
    SOLANA_PROGRAM_ID: process.env.SOLANA_PROGRAM_ID,
    VITE_SOLANA_PROGRAM_ID: process.env.VITE_SOLANA_PROGRAM_ID,
  };
  const prevDemo = process.env.DEMO_MODE;
  process.env.APP_ENV = 'production';
  process.env.DEMO_MODE = 'false';
  delete process.env.JWT_SECRET;
  delete process.env.SOLANA_RPC_URL;
  delete process.env.VITE_SOLANA_RPC_URL;
  delete process.env.SOLANA_PROGRAM_ID;
  delete process.env.VITE_SOLANA_PROGRAM_ID;
  try {
    const blockers = readiness.startupBlockers();
    assert.equal(blockers.length, 3);
  } finally {
    if (prevDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = prevDemo;
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

let server;
let base;

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('health is public; readiness report is admin-only', async () => {
  const health = await request('/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.status, 'ok');

  const ready = await request('/ready');
  assert.ok([200, 503].includes(ready.status));
  assert.equal(ready.data.demo, true);

  const denied = await request('/api/ops/readiness');
  assert.equal(denied.status, 401);

  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'test1@gmail.com', password: 'pass1234' },
  });
  const forbidden = await request('/api/ops/readiness', { token: userLogin.data.token });
  assert.equal(forbidden.status, 403);

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@defi.estate', password: 'admin1234' },
  });
  const report = await request('/api/ops/readiness', { token: adminLogin.data.token });
  assert.equal(report.status, 200);
  assert.equal(report.data.liveOfferingAllowed, false);
  assert.ok(report.data.checks.some((c) => c.id === 'audit' && c.status === 'open'));
});
