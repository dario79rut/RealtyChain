const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Keep workflow tests independent of persisted demo records and dates.
const persistence = { data: {}, save() {} };
require.cache[require.resolve('../mock/persistence')] = { exports: persistence };
const service = require('../services/governanceService');
const futureDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

beforeEach(() => {
  persistence.data = {
    users: [
      { id: 1, name: 'Shareholder', role: 'user', shareBalances: { 1: 40 }, governanceSeeded: true },
      { id: 2, name: 'Property Owner', role: 'owner', shareBalances: { 1: 40 } },
      { id: 3, name: 'Other Owner', role: 'owner' },
      { id: 4, name: 'SPV Representative', role: 'admin' },
      { id: 6, name: 'Platform Admin', role: 'admin' },
      { id: 5, name: 'Institution', role: 'institution', shareBalances: { 1: 40 } },
    ],
    properties: [{ id: 1, title: 'Test Property', ownerId: 2, tokensSold: 100,
      governanceAgreement: { spvName: 'Property SPV LLC', representativeId: '4', reference: 'DAO agreement v1' } }],
    governance: service.seedProposals(),
  };
});

function respond(userId, id, action, extra = {}) {
  return service.respond(userId, id, { action, note: 'Recorded response with supporting details.', ...extra }).proposal;
}

test('records creator and responder without inventing creators for legacy proposals', () => {
  const result = service.create(1, {
    propertyId: '1', kind: 'budget', title: 'Approve maintenance budget',
    summary: 'Approve the quoted repairs using existing property reserves.', days: 7,
  }).proposal;
  assert.deepEqual(result.createdBy, { id: '1', name: 'Shareholder' });
  assert.deepEqual(result.responder, { id: '4', name: 'SPV Representative' });
  assert.deepEqual(result.propertyOwner, { id: '2', name: 'Property Owner' });
  assert.equal(result.agreement.spvName, 'Property SPV LLC');
  assert.equal(result.execution.status, 'awaiting_vote');
  assert.equal(result.execution.acknowledgedBy, null);
  assert.equal(result.canRespond, false);
  assert.equal(service.list(2).proposals.find((row) => row.id === 'gov-lobby').canRespond, true);
  assert.equal(service.list(1).proposals.find((row) => row.id === 'gov-lobby').createdBy, null);
});

test('owner/admin responses are attributed; unrelated owners and investors cannot respond', () => {
  for (const userId of [1, 3, 5]) {
    assert.throws(() => respond(userId, 'gov-lobby', 'respond'), { status: 403 });
  }
  const result = respond(2, 'gov-lobby', 'respond');
  assert.equal(result.updates[0].author.name, 'Property Owner');
  assert.equal(result.updates[0].action, 'respond');
  assert.ok(Number.isFinite(Date.parse(result.updates[0].at)));
  assert.equal(result.execution.status, 'awaiting_vote');
  assert.equal(result.execution.acknowledgedBy, null);
  assert.equal(respond(4, 'gov-lobby', 'respond').updates.length, 2);
});

test('owner/admin/institution accounts cannot submit or vote even if they have shares', () => {
  for (const userId of [2, 4, 5]) {
    assert.throws(() => service.create(userId, { propertyId: '1' }), { status: 403 });
    assert.throws(() => service.vote(userId, 'gov-lobby', { choice: 'for' }), { status: 403 });
    assert.equal(service.list(userId).proposals.find((row) => row.id === 'gov-lobby').votingPower, 0);
  }
});

function closeLobby() {
  const proposal = persistence.data.governance.find((row) => row.id === 'gov-lobby');
  proposal.endsAt = new Date(Date.now() - 1000).toISOString();
  return proposal;
}

function assign(assignee = 'owner') {
  return respond(4, 'gov-lobby', 'assign', { assignee, dueAt: futureDate });
}

test('SPV configuration requires admin, a valid representative, and an agreement reference', () => {
  const input = { spvName: 'New SPV LLC', representativeId: '4', reference: 'DAO agreement v2' };
  for (const id of [1, 2, 3, 5]) {
    assert.throws(() => service.configureAgreement(id, '1', input), { status: 403 });
  }
  assert.throws(() => service.configureAgreement(4, '1', { ...input, representativeId: '2' }), { status: 400 });
  assert.throws(() => service.configureAgreement(4, '1', { ...input, reference: '' }), { status: 400 });
  assert.throws(() => service.configureAgreement(4, 'missing', input), { status: 404 });
  const result = service.configureAgreement(4, '1', input);
  assert.equal(result.proposals.find((row) => row.id === 'gov-lobby').agreement.spvName, 'New SPV LLC');
  assert.equal(persistence.data.properties[0].governanceAgreementHistory[0].recordedBy, 4);
  assert.equal(service.list(1).setup, null);
  assert.equal(service.list(4).setup.representatives.length, 2);
});

test('missing SPV configuration is explicit and prevents assignment even by an admin', () => {
  closeLobby();
  delete persistence.data.properties[0].governanceAgreement;
  const result = service.list(4).proposals.find((row) => row.id === 'gov-lobby');
  assert.equal(result.agreement, null);
  assert.equal(result.responder, null);
  assert.equal(result.canCoordinate, false);
  assert.throws(() => assign(), { status: 403 });
});

test('assignment requires approval, SPV authority, assignee, and a valid target date', () => {
  assert.throws(() => assign(), { status: 400 });
  assert.throws(() => respond(4, 'gov-assessment', 'assign', { assignee: 'owner', dueAt: futureDate }), { status: 400 });
  closeLobby();
  for (const id of [2, 6]) {
    assert.throws(() => respond(id, 'gov-lobby', 'assign', { assignee: 'owner', dueAt: futureDate }), { status: 403 });
  }
  for (const dueAt of [undefined, '2000-01-01', 'invalid', '2099-02-30', '2099-1-1']) {
    assert.throws(() => respond(4, 'gov-lobby', 'assign', { assignee: 'owner', dueAt }), { status: 400 });
  }
  assert.throws(() => respond(4, 'gov-lobby', 'assign', { assignee: 'someone', dueAt: futureDate }), { status: 400 });
  const result = assign();
  assert.equal(result.execution.status, 'awaiting_acknowledgment');
  assert.equal(result.execution.assignedTo.id, '2');
  assert.equal(result.execution.acknowledgedBy, null);
  assert.equal(result.agreement.spvName, 'Property SPV LLC');
  assert.equal(result.execution.agreementReference, 'DAO agreement v1');
  assert.equal(result.updates[0].assignedTo.name, 'Property Owner');
  assert.throws(() => assign(), { status: 409 });
});

test('only the assigned party acknowledges; missing acknowledgment does not remove the assignment', () => {
  closeLobby();
  assign();
  assert.throws(() => respond(4, 'gov-lobby', 'acknowledge'), { status: 403 });
  assert.throws(() => respond(6, 'gov-lobby', 'acknowledge'), { status: 403 });
  assert.throws(() => respond(2, 'gov-lobby', 'complete'), { status: 409 });
  const pending = service.list(1).proposals.find((row) => row.id === 'gov-lobby');
  assert.equal(pending.execution.assignedTo.id, '2');
  assert.equal(pending.agreement.representative.id, '4');
  const result = respond(2, 'gov-lobby', 'acknowledge');
  assert.equal(result.execution.status, 'in_progress');
  assert.equal(result.execution.acknowledgedBy.id, '2');
  assert.throws(() => respond(2, 'gov-lobby', 'acknowledge'), { status: 409 });
});

test('execution tracks owner work while SPV retains coordination and unrelated admins cannot manage it', () => {
  closeLobby();
  assign();
  respond(2, 'gov-lobby', 'acknowledge');
  assert.equal(respond(2, 'gov-lobby', 'block').execution.status, 'blocked');
  assert.throws(() => respond(2, 'gov-lobby', 'complete'), { status: 409 });
  assert.throws(() => respond(6, 'gov-lobby', 'resume'), { status: 403 });
  assert.equal(respond(4, 'gov-lobby', 'resume').execution.status, 'in_progress');
  const completed = respond(2, 'gov-lobby', 'complete');
  assert.equal(completed.status, 'passed');
  assert.equal(completed.execution.status, 'completed');
  assert.equal(completed.agreement.representative.id, '4');
  assert.deepEqual(completed.updates.map((row) => row.action), ['assign', 'acknowledge', 'block', 'resume', 'complete']);
  assert.throws(() => respond(4, 'gov-lobby', 'resume'), { status: 409 });
});

test('blockers before acknowledgment resume to pending acknowledgment', () => {
  closeLobby();
  assign();
  respond(2, 'gov-lobby', 'block');
  assert.equal(respond(4, 'gov-lobby', 'resume').execution.status, 'awaiting_acknowledgment');
  assert.equal(respond(2, 'gov-lobby', 'acknowledge').execution.status, 'in_progress');
});

test('SPV may assign its own representative and agreement changes preserve existing assignment context', () => {
  closeLobby();
  const result = assign('spv');
  assert.equal(result.execution.assignedTo.id, '4');
  assert.throws(() => respond(2, 'gov-lobby', 'acknowledge'), { status: 403 });
  service.configureAgreement(6, '1', { spvName: 'Replacement SPV', representativeId: '6', reference: 'Agreement v2' });
  const preserved = service.list(4).proposals.find((row) => row.id === 'gov-lobby');
  assert.equal(preserved.agreement.reference, 'DAO agreement v1');
  assert.equal(preserved.agreement.representative.id, '4');
  assert.equal(preserved.canCoordinate, true);
  assert.equal(service.list(6).proposals.find((row) => row.id === 'gov-lobby').canCoordinate, false);
  assert.equal(respond(4, 'gov-lobby', 'acknowledge').execution.status, 'in_progress');
});

test('legacy acceptance history is preserved while SPV review replaces unaccepted work', () => {
  const proposal = closeLobby();
  proposal.execution = { status: 'awaiting_acceptance' };
  assert.equal(service.list(4).proposals.find((row) => row.id === proposal.id).execution.status, 'awaiting_spv_review');
  proposal.execution = { status: 'in_progress', acceptedBy: 2, dueAt: futureDate, agreementReference: 'Old reference' };
  const result = service.list(4).proposals.find((row) => row.id === proposal.id);
  assert.equal(result.execution.assignedTo.id, '2');
  assert.equal(result.execution.acknowledgedBy.id, '2');
  assert.equal(result.execution.legacy, true);
  assert.equal(result.execution.agreementReference, 'Old reference');
});

test('invalid responses do not change history or execution', () => {
  for (const input of [null, { action: 'unknown', note: 'A valid length response' },
    { action: 'respond', note: 'short' }, { action: 'respond', note: 'x'.repeat(2001) }]) {
    assert.throws(() => service.respond(4, 'gov-seating', input), { status: 400 });
  }
  assert.throws(() => respond(4, 'missing', 'respond'), { status: 404 });
  const result = service.list(4).proposals.find((row) => row.id === 'gov-seating');
  assert.deepEqual(result.updates, []);
  assert.equal(result.execution.status, 'awaiting_spv_review');
});

test('response endpoint authenticates, enforces ownership, and returns the updated ticket', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const app = express();
  app.use(express.json());
  app.use('/api/governance', require('../routes/governance'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/governance/gov-lobby/respond`;
  async function request(userId) {
    const headers = { 'Content-Type': 'application/json' };
    if (userId) headers.Authorization = `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'jwt_secret')}`;
    return fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'respond', note: 'We are reviewing the contractor quote.' }) });
  }
  try {
    assert.equal((await request()).status, 401);
    assert.equal((await request(3)).status, 403);
    const res = await request(2);
    assert.equal(res.status, 200);
    const { proposal } = await res.json();
    assert.equal(proposal.updates[0].author.id, '2');
    assert.equal(proposal.updates[0].note, 'We are reviewing the contractor quote.');
    assert.equal(proposal.execution.status, 'awaiting_vote');
    const agreementUrl = `http://127.0.0.1:${server.address().port}/api/governance/properties/1/agreement`;
    const agreementInput = { spvName: 'Updated SPV LLC', representativeId: '4', reference: 'DAO agreement v3' };
    async function configure(userId) {
      return fetch(agreementUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'jwt_secret')}` },
        body: JSON.stringify(agreementInput),
      });
    }
    assert.equal((await configure(2)).status, 403);
    const configured = await configure(4);
    assert.equal(configured.status, 200);
    const result = await configured.json();
    assert.equal(result.proposals.find((row) => row.id === 'gov-lobby').agreement.reference, 'DAO agreement v3');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
