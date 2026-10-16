const crypto = require('crypto');
const persistence = require('../mock/persistence');

const KINDS = new Set(['budget', 'sale', 'manager', 'distribution']);
const CHOICES = new Set(['for', 'against']);
const WINDOWS = new Set([3, 7, 14, 30]);
const DAY = 24 * 60 * 60 * 1000;
const DEMO_BALANCES = { 1: 40, 3: 25, 6: 15 };

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function demoOn() {
  return process.env.DEMO_MODE !== 'false';
}

function propertyById(id) {
  return (persistence.data.properties || []).find((row) => String(row.id) === String(id)) || null;
}

function propertyTitle(id) {
  const row = propertyById(id);
  return row ? row.title : `Property ${id}`;
}

function seedProposals(now = Date.now()) {
  return [
    {
      id: 'gov-lobby',
      propertyId: '1',
      title: 'Approve a $180,000 lobby renovation',
      summary: 'Replace the lobby stone, lighting, and entry doors. The reserve covers the work. Work would start next quarter and should not pause rent.',
      kind: 'budget',
      createdBy: null,
      createdAt: new Date(now - 2 * DAY).toISOString(),
      endsAt: new Date(now + 6 * DAY).toISOString(),
      otherFor: 210,
      otherAgainst: 74,
      quorumShares: 180,
      votes: [],
    },
    {
      id: 'gov-manager',
      propertyId: '3',
      title: 'Appoint Harbor & Co. as property manager',
      summary: 'The current manager’s contract ends this year. Harbor & Co. bid a lower fee and a 3-year term with quarterly reporting to shareholders.',
      kind: 'manager',
      createdBy: null,
      createdAt: new Date(now - DAY).toISOString(),
      endsAt: new Date(now + 11 * DAY).toISOString(),
      otherFor: 48,
      otherAgainst: 61,
      quorumShares: 80,
      votes: [],
    },
    {
      id: 'gov-sale',
      propertyId: '6',
      title: 'Authorize a sale above $2.1 million',
      summary: 'Allow the board to accept a bona fide bid at or above $2.1 million. A lower bid would come back to shareholders.',
      kind: 'sale',
      createdBy: null,
      createdAt: new Date(now - 4 * DAY).toISOString(),
      endsAt: new Date(now + 3 * DAY).toISOString(),
      otherFor: 260,
      otherAgainst: 44,
      quorumShares: 200,
      votes: [],
    },
    {
      id: 'gov-seating',
      propertyId: '5',
      title: 'Fund the outdoor seating expansion',
      summary: 'Spend $42,000 from reserves on the patio the tenant requested. The lease amendment raises rent by 4% when the patio opens.',
      kind: 'budget',
      createdBy: null,
      createdAt: new Date(now - 20 * DAY).toISOString(),
      endsAt: new Date(now - DAY).toISOString(),
      otherFor: 240,
      otherAgainst: 36,
      quorumShares: 120,
      votes: [],
    },
    {
      id: 'gov-assessment',
      propertyId: '2',
      title: 'Special assessment for seawall repair',
      summary: 'Levy $1,200 per share for emergency seawall work. Insurance denied the claim. The work is already quoted.',
      kind: 'distribution',
      createdBy: null,
      createdAt: new Date(now - 30 * DAY).toISOString(),
      endsAt: new Date(now - 10 * DAY).toISOString(),
      otherFor: 90,
      otherAgainst: 410,
      quorumShares: 200,
      votes: [],
    },
  ];
}

function ensureStore() {
  if (!Array.isArray(persistence.data.governance)) {
    persistence.data.governance = seedProposals();
    persistence.save();
  }
}

function findUser(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (!user.shareBalances || typeof user.shareBalances !== 'object') user.shareBalances = {};
  if (demoOn() && (!user.role || user.role === 'user') && !user.governanceSeeded) {
    const held = Object.values(user.shareBalances).some((value) => Number(value) > 0);
    if (!held) Object.assign(user.shareBalances, DEMO_BALANCES);
    user.governanceSeeded = true;
    persistence.save();
  }
  return user;
}

function sharesOf(user, propertyId) {
  const value = Number(user.shareBalances?.[String(propertyId)] || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function canRespond(user, propertyId) {
  const property = propertyById(propertyId);
  return user.role === 'admin' || (user.role === 'owner' && property
    && String(property.ownerId) === String(user.id));
}

function agreementFor(proposal) {
  // Preserve the agreement and SPV responsible when work was assigned.
  return proposal.execution?.agreement || propertyById(proposal.propertyId)?.governanceAgreement || null;
}

function canCoordinate(user, proposal) {
  const agreement = agreementFor(proposal);
  return user.role === 'admin' && agreement
    && String(agreement.representativeId) === String(user.id);
}

function executionFor(proposal) {
  const execution = proposal.execution || {};
  const legacy = execution.acceptedBy != null;
  return {
    ...execution,
    status: !execution.status || execution.status === 'awaiting_acceptance'
      ? 'awaiting_spv_review' : execution.status,
    assignedTo: execution.assignedTo ?? execution.acceptedBy ?? null,
    acknowledgedBy: execution.acknowledgedBy ?? execution.acceptedBy ?? null,
    legacy,
  };
}

function actor(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  return user ? { id: String(user.id), name: user.name || 'Member' } : null;
}

function canParticipate(user) {
  return !user.role || user.role === 'user';
}

function tally(proposal, userId) {
  let forShares = Number(proposal.otherFor) || 0;
  let againstShares = Number(proposal.otherAgainst) || 0;
  let myVote = null;
  let myShares = 0;
  for (const vote of proposal.votes || []) {
    const weight = Number(vote.shares) || 0;
    if (vote.choice === 'for') forShares += weight;
    if (vote.choice === 'against') againstShares += weight;
    if (userId != null && String(vote.userId) === String(userId)) {
      myVote = vote.choice;
      myShares = weight;
    }
  }
  const turnout = forShares + againstShares;
  const quorumShares = Number(proposal.quorumShares) || 0;
  const open = Date.now() < new Date(proposal.endsAt).getTime();
  let status = 'active';
  if (!open) status = turnout >= quorumShares && forShares > againstShares ? 'passed' : 'rejected';
  return { forShares, againstShares, turnout, quorumShares, status, myVote, myShares };
}

function present(proposal, user) {
  const result = tally(proposal, user.id);
  const owner = actor(propertyById(proposal.propertyId)?.ownerId);
  const agreement = agreementFor(proposal);
  const execution = executionFor(proposal);
  const coordinator = Boolean(canCoordinate(user, proposal));
  const assignee = canRespond(user, proposal.propertyId) && String(execution.assignedTo) === String(user.id);
  return {
    id: proposal.id,
    propertyId: String(proposal.propertyId),
    propertyTitle: propertyTitle(proposal.propertyId),
    title: proposal.title,
    summary: proposal.summary,
    kind: proposal.kind,
    endsAt: proposal.endsAt,
    createdAt: proposal.createdAt,
    createdBy: actor(proposal.createdBy),
    responder: actor(agreement?.representativeId),
    propertyOwner: owner,
    agreement: agreement ? {
      spvName: agreement.spvName,
      reference: agreement.reference,
      representative: actor(agreement.representativeId),
    } : null,
    canRespond: Boolean(canRespond(user, proposal.propertyId)),
    canCoordinate: coordinator,
    canAcknowledge: Boolean(assignee && execution.status === 'awaiting_acknowledgment'),
    canManageExecution: Boolean(coordinator || assignee),
    execution: {
      status: result.status === 'active' ? 'awaiting_vote'
        : result.status === 'rejected' ? 'not_approved'
          : execution.status,
      assignedTo: actor(execution.assignedTo),
      acknowledgedBy: actor(execution.acknowledgedBy),
      dueAt: execution.dueAt || null,
      agreementReference: execution.agreementReference || agreement?.reference || null,
      legacy: execution.legacy,
    },
    updates: (proposal.updates || []).map((update) => ({ ...update, author: actor(update.userId), userId: undefined })),
    votingPower: canParticipate(user) ? sharesOf(user, proposal.propertyId) : 0,
    ...result,
  };
}

function balancesOf(user) {
  const rows = Object.entries(user.shareBalances || {})
    .map(([propertyId, raw]) => ({
      propertyId: String(propertyId),
      propertyTitle: propertyTitle(propertyId),
      shares: Math.floor(Number(raw) || 0),
    }))
    .filter((row) => row.shares > 0);
  if (user.role === 'owner') {
    for (const property of persistence.data.properties || []) {
      if (String(property.ownerId) !== String(user.id)) continue;
      const propertyId = String(property.id);
      if (rows.some((row) => row.propertyId === propertyId)) continue;
      rows.push({ propertyId, propertyTitle: property.title, shares: 0 });
    }
  }
  return rows.sort((a, b) => Number(a.propertyId) - Number(b.propertyId));
}

function list(userId, propertyId) {
  ensureStore();
  const user = findUser(userId);
  let proposals = persistence.data.governance.map((proposal) => present(proposal, user));
  if (propertyId) proposals = proposals.filter((proposal) => proposal.propertyId === String(propertyId));
  proposals.sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime();
  });
  return {
    proposals, balances: balancesOf(user),
    setup: user.role === 'admin' ? {
      properties: (persistence.data.properties || []).map((property) => ({
        id: String(property.id), title: property.title, agreement: property.governanceAgreement || null,
      })),
      representatives: persistence.data.users.filter((row) => row.role === 'admin').map((row) => actor(row.id)),
    } : null,
  };
}

function configureAgreement(userId, propertyId, input) {
  const user = findUser(userId);
  if (user.role !== 'admin') fail('Only an admin can configure the DAO agreement.', 403);
  const property = propertyById(propertyId);
  if (!property) fail('Property not found.', 404);
  const { spvName, representativeId, reference } = input || {};
  if (typeof spvName !== 'string' || spvName.trim().length < 2 || spvName.length > 200) {
    fail('SPV legal name must be 2–200 characters.', 400);
  }
  if (typeof reference !== 'string' || reference.trim().length < 3 || reference.length > 300) {
    fail('DAO agreement reference must be 3–300 characters.', 400);
  }
  const representative = persistence.data.users.find((row) => String(row.id) === String(representativeId) && row.role === 'admin');
  if (!representative) fail('Choose an admin account authorized to represent the SPV.', 400);
  const agreement = {
    spvName: spvName.trim(), representativeId: String(representative.id), reference: reference.trim(),
    recordedBy: user.id, recordedAt: new Date().toISOString(),
  };
  property.governanceAgreement = agreement;
  if (!Array.isArray(property.governanceAgreementHistory)) property.governanceAgreementHistory = [];
  property.governanceAgreementHistory.push({ ...agreement });
  persistence.save();
  return list(userId);
}

function create(userId, input) {
  ensureStore();
  const user = findUser(userId);
  if (!canParticipate(user)) fail('Only investor accounts can open shareholder votes.', 403);
  const source = input && typeof input === 'object' ? input : {};
  const propertyId = String(source.propertyId || '').trim();
  const property = propertyById(propertyId);
  if (!property) fail('Property not found.', 404);
  if (sharesOf(user, propertyId) <= 0) fail('You need shares in this property to propose.', 403);
  const title = String(source.title || '').trim();
  const summary = String(source.summary || '').trim();
  const kind = String(source.kind || '').trim();
  const days = Number(source.days || 7);
  if (title.length < 8 || title.length > 120) fail('Title must be 8–120 characters.', 400);
  if (summary.length < 20 || summary.length > 800) fail('Summary must be 20–800 characters.', 400);
  if (!KINDS.has(kind)) fail('Choose a proposal type.', 400);
  if (!WINDOWS.has(days)) fail('Voting window must be 3, 7, 14, or 30 days.', 400);
  const openCount = persistence.data.governance.filter(
    (proposal) => String(proposal.propertyId) === propertyId && Date.now() < new Date(proposal.endsAt).getTime()
  ).length;
  if (openCount >= 3) fail('This property already has 3 open votes.', 400);
  const now = new Date();
  const proposal = {
    id: `gov-${crypto.randomBytes(4).toString('hex')}`,
    propertyId,
    title,
    summary,
    kind,
    createdBy: user.id,
    createdAt: now.toISOString(),
    endsAt: new Date(now.getTime() + days * DAY).toISOString(),
    otherFor: 0,
    otherAgainst: 0,
    quorumShares: Math.max(20, Math.round((Number(property.tokensSold) || 100) * 0.2)),
    votes: [],
  };
  persistence.data.governance.unshift(proposal);
  persistence.save();
  return { proposal: present(proposal, user), ...list(userId) };
}

function vote(userId, proposalId, input) {
  ensureStore();
  const user = findUser(userId);
  if (!canParticipate(user)) fail('Only investor accounts can vote.', 403);
  const proposal = persistence.data.governance.find((row) => row.id === String(proposalId));
  if (!proposal) fail('Proposal not found.', 404);
  if (Date.now() >= new Date(proposal.endsAt).getTime()) fail('This vote is closed.', 400);
  const choice = String((input && input.choice) || '');
  if (!CHOICES.has(choice)) fail('Vote for or against.', 400);
  const power = sharesOf(user, proposal.propertyId);
  if (power <= 0) fail('You need shares in this property to vote.', 403);
  if (!Array.isArray(proposal.votes)) proposal.votes = [];
  const existing = proposal.votes.find((row) => String(row.userId) === String(user.id));
  if (existing) {
    existing.choice = choice;
    existing.shares = power;
    existing.at = new Date().toISOString();
  } else {
    proposal.votes.push({
      userId: user.id,
      choice,
      shares: power,
      at: new Date().toISOString(),
    });
  }
  persistence.save();
  return { proposal: present(proposal, user) };
}

function respond(userId, proposalId, input) {
  ensureStore();
  const user = findUser(userId);
  const proposal = persistence.data.governance.find((row) => row.id === String(proposalId));
  if (!proposal) fail('Proposal not found.', 404);
  if (!canRespond(user, proposal.propertyId)) fail('Only this property’s owner or an admin can respond.', 403);
  const { action, note, dueAt, assignee } = input || {};
  if (!['respond', 'assign', 'acknowledge', 'block', 'resume', 'complete'].includes(action)) fail('Choose a valid response action.', 400);
  if (typeof note !== 'string' || note.trim().length < 10 || note.trim().length > 2000) {
    fail('Response must be 10–2,000 characters.', 400);
  }
  const status = tally(proposal, user.id).status;
  const execution = executionFor(proposal);
  if (action !== 'respond') {
    if (status !== 'passed') fail('Work can begin only after the vote passes.', 400);
    const current = execution.status;
    if (action === 'assign') {
      if (!canCoordinate(user, proposal)) fail('Only the recorded SPV representative can assign agreement duties.', 403);
      if (current !== 'awaiting_spv_review') fail('Work has already been assigned.', 409);
      if (typeof dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)
        || !Number.isFinite(Date.parse(dueAt)) || new Date(dueAt).toISOString().slice(0, 10) !== dueAt
        || Date.parse(`${dueAt}T23:59:59.999Z`) <= Date.now()) {
        fail('Choose a valid future target date.', 400);
      }
      const agreement = agreementFor(proposal);
      let assignedTo;
      if (assignee === 'owner') {
        const owner = persistence.data.users.find((row) => String(row.id) === String(propertyById(proposal.propertyId)?.ownerId) && row.role === 'owner');
        if (!owner) fail('This property has no owner account available for assignment.', 400);
        assignedTo = owner.id;
      } else if (assignee === 'spv') {
        assignedTo = user.id;
      } else {
        fail('Assign work to the property owner or SPV representative.', 400);
      }
      Object.assign(execution, {
        status: 'awaiting_acknowledgment', assignedTo, assignedBy: user.id, dueAt,
        agreement: { ...agreement }, agreementReference: agreement.reference,
      });
    } else if (action === 'acknowledge') {
      if (String(execution.assignedTo) !== String(user.id)) fail('Only the assigned party can acknowledge its duty.', 403);
      if (current !== 'awaiting_acknowledgment') fail('This duty is not awaiting acknowledgment.', 409);
      Object.assign(execution, { status: 'in_progress', acknowledgedBy: user.id });
    } else {
      if (!canCoordinate(user, proposal) && String(execution.assignedTo) !== String(user.id)) {
        fail('Only the assigned party or SPV representative can update execution.', 403);
      }
      const allowed = action === 'resume' ? ['blocked'] : action === 'block'
        ? ['awaiting_acknowledgment', 'in_progress'] : ['in_progress'];
      if (!allowed.includes(current)) fail('That action is not available at this stage.', 409);
      execution.status = action === 'complete' ? 'completed' : action === 'block' ? 'blocked'
        : execution.acknowledgedBy ? 'in_progress' : 'awaiting_acknowledgment';
    }
  }
  proposal.execution = execution;
  if (!Array.isArray(proposal.updates)) proposal.updates = [];
  proposal.updates.push({
    userId: user.id, action, note: note.trim(), at: new Date().toISOString(),
    ...(action === 'assign' ? { assignedTo: actor(execution.assignedTo), dueAt, agreementReference: execution.agreementReference } : {}),
  });
  persistence.save();
  return { proposal: present(proposal, user) };
}

module.exports = { list, create, vote, respond, configureAgreement, seedProposals };
