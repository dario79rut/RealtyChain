const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const app = require('../app');
const persistence = require('../mock/persistence');

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
  const testIds = new Set(
    (persistence.data.users || [])
      .filter((user) => String(user.email || '').startsWith('gov-'))
      .map((user) => String(user.id))
  );
  persistence.data.users = (persistence.data.users || []).filter(
    (user) => !String(user.email || '').startsWith('gov-')
  );
  if (Array.isArray(persistence.data.governance)) {
    persistence.data.governance = persistence.data.governance.filter(
      (proposal) => !testIds.has(String(proposal.createdBy))
    );
    for (const proposal of persistence.data.governance) {
      proposal.votes = (proposal.votes || []).filter((vote) => !testIds.has(String(vote.userId)));
    }
  }
  persistence.save();
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

async function register() {
  const email = `gov-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = 'pass1234';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, username: 'Governance User' },
  });
  assert.equal(registered.status, 201);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200);
  return login.data.token;
}

test('governance requires auth', async () => {
  const res = await request('/api/governance');
  assert.equal(res.status, 401);
});

test('holders can see proposals, cast a weighted vote, and change it', async () => {
  const token = await register();
  const listed = await request('/api/governance', { token });
  assert.equal(listed.status, 200);
  const lobby = listed.data.proposals.find((proposal) => proposal.id === 'gov-lobby');
  assert.ok(lobby);
  assert.equal(lobby.status, 'active');
  assert.equal(lobby.forShares, 210);
  const power = listed.data.balances.find((row) => row.propertyId === '1');
  assert.equal(power.shares, 40);

  const closed = await request('/api/governance/gov-seating/vote', {
    method: 'POST',
    token,
    body: { choice: 'for' },
  });
  assert.equal(closed.status, 400);

  const cast = await request('/api/governance/gov-lobby/vote', {
    method: 'POST',
    token,
    body: { choice: 'for' },
  });
  assert.equal(cast.status, 200);
  assert.equal(cast.data.proposal.myVote, 'for');
  assert.equal(cast.data.proposal.forShares, 250);
  assert.equal(cast.data.proposal.againstShares, 74);

  const flipped = await request('/api/governance/gov-lobby/vote', {
    method: 'POST',
    token,
    body: { choice: 'against' },
  });
  assert.equal(flipped.status, 200);
  assert.equal(flipped.data.proposal.myVote, 'against');
  assert.equal(flipped.data.proposal.forShares, 210);
  assert.equal(flipped.data.proposal.againstShares, 114);

  const decided = listed.data.proposals.find((proposal) => proposal.id === 'gov-seating');
  assert.equal(decided.status, 'passed');
  const failed = listed.data.proposals.find((proposal) => proposal.id === 'gov-assessment');
  assert.equal(failed.status, 'rejected');
});

test('a holder can open a proposal only on a property they own', async () => {
  const token = await register();
  const denied = await request('/api/governance', {
    method: 'POST',
    token,
    body: {
      propertyId: '4',
      kind: 'budget',
      title: 'Repaint the cabin exterior',
      summary: 'The south wall paint is failing and the quote is ready for shareholder approval.',
      days: 7,
    },
  });
  assert.equal(denied.status, 403);

  const created = await request('/api/governance', {
    method: 'POST',
    token,
    body: {
      propertyId: '1',
      kind: 'distribution',
      title: 'Raise the quarterly distribution',
      summary: 'Move the distribution from 80% of net rent to 90% while keeping the reserve intact.',
      days: 14,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.proposal.propertyId, '1');
  assert.equal(created.data.proposal.status, 'active');
  assert.ok(created.data.proposals.some((proposal) => proposal.id === created.data.proposal.id));
});
