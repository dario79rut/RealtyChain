const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');
const DAY = 86400000;
const ACTIVE = new Set(['queued', 'partially_filled']);

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function propertyById(id) {
  const property = (persistence.data.properties || []).find((row) => String(row.id) === String(id));
  if (!property) fail('Property not found.', 404);
  return property;
}
function participant(user) {
  return user && (!user.role || user.role === 'user') && !user.suspended && !user.restricted;
}
function assertTrading(user, property) {
  if (!participant(user)) fail('An active investor account is required.', 403);
  if (property.platform?.suspended || property.platform?.tradingPaused || property.platform?.transfersRestricted || property.redemptionAddress) {
    fail('Trading or transfers are unavailable for this property.', 403);
  }
}
function book() { market.ensureStore(); return persistence.data.market; }
function requests() { return book().exitRequests || []; }
function nextWindow(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(16, 0, 0, 0);
  next.setUTCDate(next.getUTCDate() + (5 - next.getUTCDay() + 7) % 7);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString();
}
function quantities(input) {
  if (!input || !['number', 'string'].includes(typeof input.shares) || !['number', 'string'].includes(typeof input.price)) fail('Enter a whole share quantity and a numeric price.');
  const shares = Number(input?.shares);
  const price = Number(input?.price);
  const cents = Math.round(price * 100);
  if (!Number.isSafeInteger(shares) || shares < 1 || shares > 5000) fail('Enter between 1 and 5,000 whole shares.');
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(cents) || cents < 1 || !Number.isSafeInteger(cents * shares)) fail('Enter a valid price of at least 0.01 USDC.');
  return { shares, cents };
}
function pledgedAndReserved(user, propertyId) {
  const asks = market.openOrders(propertyId, 'ask').filter((row) => String(row.userId) === String(user.id)).reduce((sum, row) => sum + row.remaining, 0);
  const exits = requests().filter((row) => ACTIVE.has(row.status) && String(row.userId) === String(user.id) && row.propertyId === String(propertyId)).reduce((sum, row) => sum + row.remaining, 0);
  const pledged = (persistence.data.lending?.loans || []).filter((row) => String(row.userId) === String(user.id)).flatMap((row) => row.collateral || [])
    .filter((line) => String(line.propertyId) === String(propertyId)).reduce((sum, line) => sum + line.shares, 0);
  return asks + exits + pledged + market.rfqReservations(user.id, propertyId, false);
}
function backedOrders(propertyId, side) {
  return market.openOrders(propertyId, side).filter((order) => {
    if (order.userId == null) return false;
    const user = persistence.data.users.find((row) => String(row.id) === String(order.userId));
    if (!participant(user)) return false;
    if (side === 'bid') return Number(user.cashCents || 0) >= market.reservedCashCents(user.id);
    return Number(user.shareBalances?.[propertyId] || 0) >= pledgedAndReserved(user, propertyId);
  }).sort((a, b) => (side === 'bid' ? b.priceCents - a.priceCents : a.priceCents - b.priceCents)
    || a.createdAt.localeCompare(b.createdAt));
}
function presentRequest(row, viewerId) {
  const eligible = Date.parse(row.windowAt) <= Date.now();
  const ahead = requests().filter((other) => other.propertyId === row.propertyId && ACTIVE.has(other.status)
    && (other.createdAt < row.createdAt || (other.createdAt === row.createdAt && other.sequence < row.sequence))).length;
  return { id: row.id, propertyId: row.propertyId, shares: row.shares, remaining: row.remaining,
    filled: row.shares - row.remaining, minimumPrice: market.dollars(row.minimumCents),
    proceedsUsdc: market.dollars(row.proceedsCents || 0), status: row.status === 'queued' && eligible ? 'awaiting_liquidity' : row.status,
    eligible, queuePosition: ACTIVE.has(row.status) ? ahead + 1 : null,
    windowAt: row.windowAt, createdAt: row.createdAt, updatedAt: row.updatedAt, events: row.events || [],
    own: String(row.userId) === String(viewerId) };
}
function snapshot(userId, propertyId) {
  book();
  const user = market.findUser(userId);
  const property = propertyById(propertyId);
  const id = String(property.id);
  const bids = backedOrders(id, 'bid');
  const asks = backedOrders(id, 'ask');
  const bid = bids[0]?.priceCents;
  const ask = asks[0]?.priceCents;
  const recorded = book().trades.filter((row) => String(row.propertyId) === id && row.buyerId != null && row.sellerId != null);
  const recent = recorded.filter((row) => Date.parse(row.at) >= Date.now() - DAY && Date.parse(row.at) <= Date.now());
  const appraisal = [...(property.appraisals || [])].filter((row) => Number(row.valueUsd) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const nav = appraisal && property.totalTokens > 0 ? appraisal.valueUsd / property.totalTokens : null;
  const last = [...recorded].sort((a, b) => b.at.localeCompare(a.at))[0];
  const grouped = (orders) => {
    const map = new Map();
    for (const row of orders) map.set(row.priceCents, (map.get(row.priceCents) || 0) + row.remaining);
    return [...map].map(([price, shares]) => ({ price: market.dollars(price), shares }));
  };
  return {
    propertyId: id, propertyTitle: property.title, asOf: new Date().toISOString(),
    demoMode: process.env.DEMO_MODE !== 'false', settlement: 'application_ledger',
    tradingAvailable: participant(user) && !(property.platform?.suspended || property.platform?.tradingPaused || property.platform?.transfersRestricted || property.redemptionAddress),
    bestBid: bid == null ? null : market.dollars(bid), bestAsk: ask == null ? null : market.dollars(ask),
    spread: bid != null && ask != null ? market.dollars(ask - bid) : null,
    crossedBook: bid != null && ask != null && bid >= ask,
    activeBuyers: new Set(bids.map((row) => String(row.userId))).size,
    bidDepthUsdc: market.dollars(bids.reduce((sum, row) => sum + row.priceCents * row.remaining, 0)),
    bidDepthShares: bids.reduce((sum, row) => sum + row.remaining, 0),
    volume24hUsdc: market.dollars(recent.reduce((sum, row) => sum + row.priceCents * row.shares, 0)),
    volume24hShares: recent.reduce((sum, row) => sum + row.shares, 0),
    trades24h: recent.length, navPerShare: nav,
    lastAccountPrice: last ? market.dollars(last.priceCents) : null,
    premiumToNav: last && nav ? market.dollars(last.priceCents) / nav - 1 : null,
    appraisalDate: appraisal?.date || null,
    bids: grouped(bids), asks: grouped(asks),
    sellableBids: grouped(bids.filter((row) => String(row.userId) !== String(user.id))),
    ownBids: bids.filter((row) => String(row.userId) === String(user.id)).map((row) => ({ id: row.id,
      shares: row.remaining, price: market.dollars(row.priceCents), reservedUsdc: market.dollars(row.priceCents * row.remaining) })),
    cashAvailable: market.dollars(market.availableCashCents(user)), availableShares: market.availableShares(user, id),
    nextWindowAt: nextWindow(),
    exitRequests: requests().filter((row) => String(row.userId) === String(user.id) && row.propertyId === id)
      .sort((a, b) => b.sequence - a.sequence).map((row) => presentRequest(row, user.id)),
    recentTrades: recorded.slice(0, 10).map((row) => ({ id: row.id, price: market.dollars(row.priceCents), shares: row.shares, at: row.at })),
  };
}
function bid(userId, propertyId, input) {
  book();
  const user = market.findUser(userId);
  assertTrading(user, propertyById(propertyId));
  const { shares, cents } = quantities(input);
  market.place(userId, { propertyId: String(propertyId), side: 'bid', shares, price: market.dollars(cents), open: true });
  return snapshot(userId, propertyId);
}
function cancelBid(userId, propertyId, orderId) {
  book();
  const order = book().orders.find((row) => row.id === String(orderId) && row.propertyId === String(propertyId) && row.side === 'bid');
  if (!order) fail('Bid not found.', 404);
  market.cancel(userId, orderId);
  return snapshot(userId, propertyId);
}
function createExit(userId, propertyId, input) {
  book();
  const user = market.findUser(userId);
  assertTrading(user, propertyById(propertyId));
  const { shares, cents } = quantities(input);
  const weeks = Number(input?.windowWeeks ?? 1);
  if (![1, 2, 4].includes(weeks)) fail('Choose the next, second, or fourth processing window.');
  if (shares > market.availableShares(user, propertyId)) fail('Not enough unreserved, unpledged shares for this exit.');
  if (requests().filter((row) => String(row.userId) === String(user.id) && ACTIVE.has(row.status)).length >= 20) fail('Cancel or settle an existing exit before adding another.');
  const now = new Date().toISOString();
  const row = { id: `exit-${crypto.randomBytes(8).toString('hex')}`, sequence: Math.max(0, ...requests().map((request) => request.sequence || 0)) + 1,
    userId: user.id, propertyId: String(propertyId), shares, remaining: shares, minimumCents: cents, proceedsCents: 0,
    status: 'queued', windowAt: new Date(Date.parse(nextWindow()) + (weeks - 1) * 7 * DAY).toISOString(),
    createdAt: now, updatedAt: now, events: [{ at: now, action: 'requested', note: 'Shares reserved for the selected exit window.' }] };
  if (!Array.isArray(book().exitRequests)) book().exitRequests = [];
  book().exitRequests.push(row);
  persistence.save();
  return snapshot(userId, propertyId);
}
function ownExit(userId, propertyId, requestId) {
  const row = requests().find((request) => request.id === String(requestId) && request.propertyId === String(propertyId));
  if (!row) fail('Exit request not found.', 404);
  if (String(row.userId) !== String(userId)) fail('That exit request is not yours.', 403);
  if (!ACTIVE.has(row.status)) fail('This exit request is already closed.', 409);
  return row;
}
function cancelExit(userId, propertyId, requestId) {
  market.findUser(userId);
  const row = ownExit(userId, propertyId, requestId);
  row.status = 'cancelled';
  row.updatedAt = new Date().toISOString();
  row.events.push({ at: row.updatedAt, action: 'cancelled', note: `${row.remaining} unfilled shares released; previously settled fills remain final.` });
  persistence.save();
  return snapshot(userId, propertyId);
}
function executeExit(userId, propertyId, requestId) {
  book();
  const user = market.findUser(userId);
  assertTrading(user, propertyById(propertyId));
  const requested = ownExit(userId, propertyId, requestId);
  if (Date.parse(requested.windowAt) > Date.now()) fail('This exit window has not opened yet.', 409);
  // The request authorizes matching at its recorded minimum once the window opens.
  // Any processing call settles earlier eligible requests first, without requiring their owners online.
  const queue = requests().filter((row) => row.propertyId === String(propertyId) && ACTIVE.has(row.status)
    && Date.parse(row.windowAt) <= Date.now() && row.sequence <= requested.sequence)
    .sort((a, b) => a.sequence - b.sequence);
  let settled = 0;
  for (const row of queue) {
    const seller = persistence.data.users.find((account) => String(account.id) === String(row.userId));
    if (!participant(seller) || Number(seller.shareBalances?.[propertyId] || 0) < pledgedAndReserved(seller, propertyId)) continue;
    const eligible = backedOrders(propertyId, 'bid').filter((order) => String(order.userId) !== String(seller.id) && order.priceCents >= row.minimumCents);
    const plan = [];
    let remaining = row.remaining;
    for (const order of eligible) {
      const shares = Math.min(remaining, order.remaining);
      if (shares > 0) plan.push({ order, shares });
      remaining -= shares;
      if (!remaining) break;
    }
    if (!plan.length) continue;
    let proceeds = 0;
    for (const { order, shares } of plan) {
      const buyer = persistence.data.users.find((account) => String(account.id) === String(order.userId));
      market.applyFill(buyer, seller, String(propertyId), shares, order.priceCents, 'sell');
      market.consume(order, shares);
      row.remaining -= shares;
      proceeds += shares * order.priceCents;
    }
    row.proceedsCents += proceeds;
    row.status = row.remaining ? 'partially_filled' : 'completed';
    row.updatedAt = new Date().toISOString();
    const shares = plan.reduce((sum, fill) => sum + fill.shares, 0);
    row.events.push({ at: row.updatedAt, action: row.status, note: `${shares} shares settled for ${market.dollars(proceeds)} USDC in the application ledger.`, shares, proceedsUsdc: market.dollars(proceeds) });
    settled += shares;
  }
  if (!settled) fail('No account-reserved bids can settle the eligible queue at the recorded minimum prices. Requests remain reserved.', 409);
  persistence.save();
  return snapshot(userId, propertyId);
}

module.exports = { snapshot, bid, cancelBid, createExit, cancelExit, executeExit, nextWindow, backedOrders };
