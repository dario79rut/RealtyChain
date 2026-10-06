const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const app = require('../app');
const persistence = require('../mock/persistence');

let server;
let base;
const created = [];

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  persistence.data.cordaPositions = (persistence.data.cordaPositions || []).filter((row) => !created.includes(row.linearId));
  persistence.data.solanaSettlements = (persistence.data.solanaSettlements || []).filter((row) => !created.includes(row.id));
  persistence.save();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function login(email, password) {
  const { status, data } = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(status, 200);
  return data.token;
}

test('Corda settlement publishes shares and a commitment, not the institution', async () => {
  const institution = await login('institution@defi.estate', 'institution1234');
  const investor = await login('test1@gmail.com', 'pass1234');

  const denied = await request('/api/bridge/desk', { token: investor });
  assert.equal(denied.status, 403);

  const issued = await request('/api/bridge/positions', {
    method: 'POST',
    token: institution,
    body: { propertyId: 1, shares: 25 },
  });
  assert.equal(issued.status, 200);
  created.push(issued.data.position.linearId);
  assert.equal(issued.data.position.private.legalName, 'Northline Capital LLP');
  assert.equal(issued.data.position.status, 'ISSUED');

  const settled = await request(`/api/bridge/positions/${issued.data.position.linearId}/settle`, {
    method: 'POST',
    token: institution,
  });
  assert.equal(settled.status, 200);
  created.push(settled.data.solana.id);
  assert.equal(settled.data.solana.solana.tag, 14);
  assert.equal(settled.data.solana.solana.instructionHex.length, 114);
  assert.equal(settled.data.solana.shares, 25);
  assert.equal(Object.hasOwn(settled.data.solana, 'private'), false);
  assert.equal(JSON.stringify(settled.data.solana).includes('Northline'), false);
  assert.equal(JSON.stringify(settled.data.solana).includes('894500'), false);

  const tape = await request('/api/bridge/public', { token: investor });
  assert.equal(tape.status, 200);
  const row = tape.data.settlements.find((item) => item.id === settled.data.solana.id);
  assert.ok(row);
  assert.equal(JSON.stringify(row).includes('Northline'), false);
  assert.equal(row.commitment, settled.data.corda.commitment);
});
