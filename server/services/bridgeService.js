const crypto = require('crypto');
const persistence = require('../mock/persistence');

const INSTITUTION_NODE = 'O=Northline Capital, L=London, C=GB';
const OPERATOR_NODE = 'O=RealtyChain Operator, C=GB';
const NOTARY = 'O=RealtyChain Notary, C=GB';

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function accountOf(userId) {
  return (persistence.data.users || []).find((user) => String(user.id) === String(userId));
}

function requireRole(user, roles) {
  const account = accountOf(user && user.sub);
  if (!account || !roles.includes(account.role)) fail('Institutional access required.', 403);
  return account;
}

function propertyOf(propertyId) {
  return (persistence.data.properties || []).find((property) => String(property.id) === String(propertyId));
}

function positions() {
  if (!Array.isArray(persistence.data.cordaPositions)) persistence.data.cordaPositions = [];
  return persistence.data.cordaPositions;
}

function settlements() {
  if (!Array.isArray(persistence.data.solanaSettlements)) persistence.data.solanaSettlements = [];
  return persistence.data.solanaSettlements;
}

function commitmentFor(position) {
  const payload = [
    position.linearId,
    position.propertyId,
    position.shares,
    position.private.lei,
    position.private.legalName,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function encodeSettle(propertyId, shares, commitmentHex) {
  const data = Buffer.alloc(57);
  data[0] = 14;
  data.writeBigUInt64LE(BigInt(propertyId), 1);
  data.writeBigUInt64LE(BigInt(shares), 9);
  Buffer.from(commitmentHex, 'hex').copy(data, 25);
  return data.toString('hex');
}

function publicSettlement(row) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyTitle: row.propertyTitle,
    shares: row.shares,
    commitment: row.commitment,
    solana: row.solana,
    settledAt: row.settledAt,
  };
}

function privatePosition(row) {
  return {
    linearId: row.linearId,
    status: row.status,
    propertyId: row.propertyId,
    propertyTitle: row.propertyTitle,
    shares: row.shares,
    participants: row.participants,
    notary: row.notary,
    private: row.private,
    commitment: row.commitment,
    settlementId: row.settlementId || null,
    createdAt: row.createdAt,
    settledAt: row.settledAt || null,
  };
}

function createPosition(user, body) {
  const account = requireRole(user, ['institution']);
  const property = propertyOf(body && body.propertyId);
  if (!property) fail('Choose a property on the catalog.');
  const shares = Number(body && body.shares);
  if (!Number.isInteger(shares) || shares <= 0 || shares > 1_000_000) {
    fail('Enter a whole number of shares.');
  }
  const legalName = account.kyc?.legalName || account.name || 'Institution';
  const position = {
    linearId: crypto.randomUUID(),
    status: 'ISSUED',
    propertyId: property.id,
    propertyTitle: property.title,
    shares,
    participants: [INSTITUTION_NODE, OPERATOR_NODE],
    notary: NOTARY,
    private: {
      holderUserId: account.id,
      legalName,
      lei: '894500CORDAINST00001',
      country: account.kyc?.country || 'GB',
    },
    commitment: null,
    settlementId: null,
    createdAt: new Date().toISOString(),
    settledAt: null,
  };
  positions().unshift(position);
  persistence.save();
  return privatePosition(position);
}

function settle(user, linearId) {
  const account = requireRole(user, ['institution']);
  const position = positions().find((row) => row.linearId === linearId);
  if (!position || String(position.private.holderUserId) !== String(account.id)) {
    fail('That Corda state is not on this node.', 404);
  }
  if (position.status !== 'ISSUED') fail('This position is already on Solana.');
  if (account.kycStatus !== 'approved' || !account.accredited) {
    fail('Corda compliance rejected the settlement. The institution must be verified and accredited.');
  }
  const commitment = commitmentFor(position);
  const settlement = {
    id: crypto.randomUUID(),
    propertyId: position.propertyId,
    propertyTitle: position.propertyTitle,
    shares: position.shares,
    commitment,
    solana: {
      tag: 14,
      operation: 'settle',
      instructionHex: encodeSettle(position.propertyId, position.shares, commitment),
    },
    settledAt: new Date().toISOString(),
  };
  position.status = 'SETTLED';
  position.commitment = commitment;
  position.settlementId = settlement.id;
  position.settledAt = settlement.settledAt;
  settlements().unshift(settlement);
  persistence.save();
  return {
    corda: privatePosition(position),
    solana: publicSettlement(settlement),
  };
}

function desk(user) {
  const account = requireRole(user, ['institution', 'admin']);
  const rows = account.role === 'admin'
    ? positions()
    : positions().filter((row) => String(row.private.holderUserId) === String(account.id));
  return {
    role: account.role === 'admin' ? 'operator' : 'institution',
    node: account.role === 'admin' ? OPERATOR_NODE : INSTITUTION_NODE,
    notary: NOTARY,
    counterparty: account.role === 'admin' ? INSTITUTION_NODE : OPERATOR_NODE,
    identity: {
      legalName: account.kyc?.legalName || account.name,
      lei: account.role === 'institution' ? '894500CORDAINST00001' : null,
      country: account.kyc?.country || null,
      verified: account.kycStatus === 'approved' && Boolean(account.accredited),
    },
    positions: rows.map(privatePosition),
  };
}

function publicTape() {
  return {
    network: 'solana',
    operation: 'settle',
    tag: 14,
    settlements: settlements().map(publicSettlement),
  };
}

module.exports = {
  createPosition,
  settle,
  desk,
  publicTape,
};
