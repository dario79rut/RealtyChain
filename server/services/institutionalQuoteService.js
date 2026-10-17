const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function rows() { return persistence.data.institutionalQuotes || []; }
function account(id) { const user = persistence.data.users.find((row) => String(row.id) === String(id)); if (!user) fail('Unauthorized.', 401); return user; }
function allowed(user) { return user.role === 'institution' && user.kycStatus === 'approved' && user.accredited && !user.suspended && !user.restricted; }
function operator(id) { const user = account(id); if (user.role !== 'admin' || user.suspended) fail('Operator access required.', 403); return user; }
function property(id) { const row = persistence.data.properties.find((item) => String(item.id) === String(id)); if (!row) fail('Property not found.', 404); return row; }
function checkProperty(row) { const item = property(row.propertyId); if (item.platform?.suspended || item.platform?.tradingPaused || item.platform?.transfersRestricted || item.redemptionAddress) fail('Trading or transfers are unavailable for this property.', 403); }
function effectiveStatus(row, now = Date.now()) { return ['proposed', 'quoted', 'accepted'].includes(row.status) && Date.parse(row.status === 'accepted' ? row.settlementDeadline : row.quoteExpiresAt) <= now ? 'expired' : row.status; }
function get(id) { const row = rows().find((item) => item.id === id); if (!row) fail('Quote request not found.', 404); return row; }
function event(row, action, userId, note) { row.history.push({ at: new Date().toISOString(), action, actor: String(userId), note }); row.updatedAt = new Date().toISOString(); }
function participantName(id) { const user = account(id); return user.kyc?.legalName || user.name || 'Institutional account'; }
function snapshot(userId) {
  const user = account(userId); if (!['institution', 'admin'].includes(user.role)) fail('Institutional access required.', 403);
  return { role: user.role, eligible: allowed(user), settlement: 'application_ledger', demoMode: process.env.DEMO_MODE !== 'false',
    counterparties: user.role === 'admin' ? persistence.data.users.filter(allowed).map((row) => ({ id: String(row.id), name: participantName(row.id) })) : [],
    requests: rows().filter((row) => user.role === 'admin' || row.userId === String(userId) || row.counterpartyId === String(userId))
      .map((row) => ({ ...row, status: effectiveStatus(row), requester: participantName(row.userId), counterparty: row.counterpartyId ? participantName(row.counterpartyId) : null,
        isRequester: row.userId === String(userId), isCounterparty: row.counterpartyId === String(userId) })),
  };
}
function request(userId, input) {
  market.ensureStore(); const user = account(userId); if (!allowed(user)) fail('A verified, accredited institutional account is required.', 403);
  property(input.propertyId);
  const shares = Number(input.shares); if (!Number.isSafeInteger(shares) || shares < 1 || shares > 1000000) fail('Enter 1–1,000,000 whole shares.');
  if (!['buy', 'sell'].includes(input.side)) fail('Choose buy or sell.');
  const note = String(input.note || '').trim(); if (note.length > 1000) fail('Request notes must be at most 1,000 characters.');
  const now = new Date().toISOString();
  const row = { id: `rfq-${crypto.randomBytes(8).toString('hex')}`, userId: String(userId), propertyId: String(input.propertyId), propertyTitle: property(input.propertyId).title,
    side: input.side, shares, note, status: 'requested', createdAt: now, updatedAt: now, history: [] };
  checkProperty(row); event(row, 'requested', userId, 'Institution requested an all-or-none block quote.');
  if (!Array.isArray(persistence.data.institutionalQuotes)) persistence.data.institutionalQuotes = [];
  persistence.data.institutionalQuotes.unshift(row); persistence.save(); return snapshot(userId);
}
function quote(userId, id, input) {
  operator(userId); const row = get(id); if (effectiveStatus(row) !== 'requested') fail('This request is not awaiting a quote.', 409);
  checkProperty(row);
  const counterparty = account(input.counterpartyId);
  if (!allowed(counterparty) || String(counterparty.id) === row.userId) fail('Choose a different eligible institutional counterparty.');
  const priceCents = Math.round(Number(input.price) * 100); const hours = Number(input.validHours || 24);
  if (!Number.isSafeInteger(priceCents) || priceCents < 1 || !Number.isSafeInteger(priceCents * row.shares)) fail('Enter a positive, valid share price.');
  if (!Number.isInteger(hours) || hours < 1 || hours > 72) fail('Quote validity must be 1–72 hours.');
  if (row.side === 'buy' ? market.availableShares(counterparty, row.propertyId) < row.shares : market.availableCashCents(counterparty) < priceCents * row.shares) fail('The proposed counterparty does not have sufficient unreserved cash or shares.');
  Object.assign(row, { counterpartyId: String(counterparty.id), price: priceCents / 100, notionalUsdc: priceCents * row.shares / 100,
    status: 'proposed', quoteExpiresAt: new Date(Date.now() + hours * 3600000).toISOString(), quotedBy: String(userId) });
  event(row, 'proposed', userId, 'Operator proposed terms. Counterparty confirmation is required before funds or shares are reserved.');
  persistence.save(); return snapshot(userId);
}
function confirm(userId, id) {
  market.ensureStore(); const user = account(userId); const row = get(id);
  if (row.counterpartyId !== String(userId) || !allowed(user)) fail('Only the named eligible counterparty can confirm.', 403);
  if (row.status !== 'proposed' || Date.parse(row.quoteExpiresAt) <= Date.now()) fail('The proposed quote is no longer available.', 409);
  checkProperty(row);
  if (row.side === 'buy' ? market.availableShares(user, row.propertyId) < row.shares : market.availableCashCents(user) < Math.round(row.notionalUsdc * 100)) fail('Insufficient unreserved cash or shares to back this quote.');
  row.status = 'quoted'; event(row, 'confirmed', userId, 'Counterparty confirmed and reserved the assets backing the quote.');
  persistence.save(); return snapshot(userId);
}
function accept(userId, id) {
  market.ensureStore(); const user = account(userId); const row = get(id);
  if (row.userId !== String(userId) || !allowed(user)) fail('Only the requesting eligible institution can accept.', 403);
  if (effectiveStatus(row) !== 'quoted') fail('The confirmed quote is unavailable or expired.', 409);
  if (!allowed(account(row.counterpartyId))) fail('The counterparty is no longer eligible.', 403);
  checkProperty(row);
  if (row.side === 'buy' ? market.availableCashCents(user) < Math.round(row.notionalUsdc * 100) : market.availableShares(user, row.propertyId) < row.shares) fail('Insufficient unreserved cash or shares to accept.');
  row.status = 'accepted'; row.settlementDeadline = new Date(Date.now() + 48 * 3600000).toISOString();
  event(row, 'accepted', userId, 'Requester accepted the quote; both sides are reserved for operator settlement within 48 hours.');
  persistence.save(); return snapshot(userId);
}
function cancel(userId, id) {
  const user = account(userId); const row = get(id);
  if (user.role !== 'admin' && row.userId !== String(userId) && row.counterpartyId !== String(userId)) fail('This quote is private to its participants.', 403);
  if (['settled', 'cancelled'].includes(row.status)) fail('This quote request is closed.', 409);
  row.status = 'cancelled'; event(row, 'cancelled', userId, 'Quote cancelled; outstanding reservations released.');
  persistence.save(); return snapshot(userId);
}
function settle(userId, id) {
  operator(userId); market.ensureStore(); const row = get(id);
  if (effectiveStatus(row) !== 'accepted') fail('Only an accepted, unexpired quote can settle.', 409);
  checkProperty(row);
  const requester = account(row.userId); const other = account(row.counterpartyId);
  if (!allowed(requester) || !allowed(other)) fail('Both institutions must remain verified and unrestricted.', 403);
  const buyer = row.side === 'buy' ? requester : other; const seller = row.side === 'sell' ? requester : other;
  if (buyer.cashCents < market.reservedCashCents(buyer.id) || Number(seller.shareBalances?.[row.propertyId] || 0) < market.reservedShares(seller.id, row.propertyId) + market.lockedShares(seller.id, row.propertyId)) fail('The reserved settlement assets are no longer fully covered.', 409);
  market.applyFill(buyer, seller, row.propertyId, row.shares, Math.round(row.price * 100), 'buy');
  row.status = 'settled'; row.settledAt = new Date().toISOString(); row.settlementReference = persistence.data.market.trades[0].id;
  event(row, 'settled', userId, `All ${row.shares} shares settled for ${row.notionalUsdc} USDC in the application ledger.`);
  persistence.save(); return snapshot(userId);
}
module.exports = { snapshot, request, quote, confirm, accept, cancel, settle, effectiveStatus };
