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
  if (demoOn() && user.role !== 'admin' && !user.governanceSeeded) {
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
  return {
    id: proposal.id,
    propertyId: String(proposal.propertyId),
    propertyTitle: propertyTitle(proposal.propertyId),
    title: proposal.title,
    summary: proposal.summary,
    kind: proposal.kind,
    endsAt: proposal.endsAt,
    createdAt: proposal.createdAt,
    votingPower: sharesOf(user, proposal.propertyId),
    ...tally(proposal, user.id),
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
  return { proposals, balances: balancesOf(user) };
}

function create(userId, input) {
  ensureStore();
  const user = findUser(userId);
  const source = input && typeof input === 'object' ? input : {};
  const propertyId = String(source.propertyId || '').trim();
  const property = propertyById(propertyId);
  if (!property) fail('Property not found.', 404);
  const ownsListing = user.role === 'owner' && String(property.ownerId) === String(user.id);
  if (sharesOf(user, propertyId) <= 0 && !ownsListing) fail('You need shares in this property to propose.', 403);
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

module.exports = { list, create, vote, seedProposals };
