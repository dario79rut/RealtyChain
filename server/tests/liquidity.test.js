const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.DEMO_MODE = 'false';
const persistence = { data: {}, save() {} };
require.cache[require.resolve('../mock/persistence')] = { exports: persistence };
const service = require('../services/liquidityService');
const market = require('../services/marketService');
const lending = require('../services/lendingService');

beforeEach(() => {
  persistence.data = {
    users: [
      { id: 1, name: 'Seller', role: 'user', cashCents: 0, shareBalances: { 1: 100 } },
      { id: 2, name: 'Buyer', role: 'user', cashCents: 1000000, shareBalances: {} },
      { id: 3, name: 'Other seller', role: 'user', cashCents: 1000000, shareBalances: { 1: 100 } },
      { id: 4, name: 'Admin', role: 'admin', cashCents: 1000000, shareBalances: { 1: 100 } },
    ],
    properties: [{ id: '1', title: 'Test property', price: 100000, totalTokens: 1000,
      appraisals: [{ date: '2026-10-01', valueUsd: 100000 }] }],
    market: { orders: [], trades: [], opens: { 1: 10000 }, exitRequests: [] },
    lending: { poolCents: 1000000, loans: [], supplies: [] },
  };
});
const exit = (user = 1, shares = 10, price = 90) => service.createExit(user, '1', { shares, price, windowWeeks: 1 }).exitRequests[0];
const openWindow = (id) => { persistence.data.market.exitRequests.find((row) => row.id === id).windowAt = new Date(Date.now() - 1000).toISOString(); };

test('buy liquidity is cash reserved and synthetic quotes and prints do not inflate it', () => {
  service.bid(2, '1', { shares: 10, price: 90 });
  persistence.data.market.orders.push({ id: 'book-demo', propertyId: '1', userId: null, side: 'bid', status: 'open', remaining: 10000, priceCents: 100000, createdAt: new Date().toISOString() });
  persistence.data.market.trades.push({ id: 'demo-fill', propertyId: '1', buyerId: 2, sellerId: null, shares: 100, priceCents: 10000, at: new Date().toISOString() });
  const desk = service.snapshot(2, '1');
  assert.equal(desk.bidDepthUsdc, 900);
  assert.equal(desk.activeBuyers, 1);
  assert.equal(desk.volume24hUsdc, 0);
  assert.equal(desk.bestBid, 90);
  assert.equal(desk.cashAvailable, 9100);
  assert.equal(desk.sellableBids.length, 0);
  assert.throws(() => service.bid(2, '1', { shares: 200, price: 90 }), /Not enough cash/);
  assert.throws(() => lending.supply(2, { usdc: 9500 }), /Not enough USDC/);
  service.cancelBid(2, '1', desk.ownBids[0].id);
  assert.equal(service.snapshot(2, '1').cashAvailable, 10000);
});

test('exit reservations cannot be sold twice or reused as lending margin', () => {
  const request = exit(1, 70);
  assert.equal(service.snapshot(1, '1').availableShares, 30);
  assert.throws(() => exit(1, 31), /Not enough unreserved/);
  assert.throws(() => market.place(1, { propertyId: '1', side: 'ask', shares: 31, price: 90, open: true }), /Not enough shares/);
  assert.throws(() => lending.borrow(1, { propertyId: '1', shares: 31, usdc: 1 }), /Not enough free shares/);
  service.cancelExit(1, '1', request.id);
  assert.equal(service.snapshot(1, '1').availableShares, 100);
});

test('exit processing respects the date, minimum price and account backing', () => {
  service.bid(2, '1', { shares: 10, price: 89 });
  const request = exit();
  assert.throws(() => service.executeExit(1, '1', request.id), /not opened/);
  openWindow(request.id);
  persistence.data.market.orders.push({ id: 'book-demo', propertyId: '1', userId: null, side: 'bid', status: 'open', remaining: 1000, priceCents: 100000, createdAt: new Date().toISOString() });
  assert.throws(() => service.executeExit(1, '1', request.id), /No account-reserved bids/);
  assert.equal(service.snapshot(1, '1').exitRequests[0].remaining, 10);
  assert.equal(persistence.data.users[0].cashCents, 0);
});

test('partial settlement updates both accounts, reservations, history, volume and NAV comparison', () => {
  service.bid(2, '1', { shares: 4, price: 95 });
  const request = exit(); openWindow(request.id);
  let desk = service.executeExit(1, '1', request.id);
  assert.equal(desk.exitRequests[0].status, 'partially_filled');
  assert.equal(desk.exitRequests[0].filled, 4);
  assert.equal(desk.exitRequests[0].remaining, 6);
  assert.equal(desk.exitRequests[0].proceedsUsdc, 380);
  assert.equal(desk.availableShares, 90);
  assert.equal(persistence.data.users[0].cashCents, 38000);
  assert.equal(persistence.data.users[1].shareBalances[1], 4);
  assert.equal(desk.volume24hUsdc, 380);
  assert.ok(Math.abs(desk.premiumToNav + 0.05) < 1e-9);
  assert.equal(desk.recentTrades.length, 1);
  service.bid(2, '1', { shares: 6, price: 90 });
  desk = service.executeExit(1, '1', request.id);
  assert.equal(desk.exitRequests[0].status, 'completed');
  assert.equal(desk.exitRequests[0].proceedsUsdc, 920);
  assert.equal(desk.availableShares, 90);
  assert.equal(desk.exitRequests[0].events.length, 3);
  assert.equal(service.snapshot(2, '1').ownBids.length, 0);
  assert.throws(() => service.executeExit(1, '1', request.id), /already closed/);
});

test('cancelling a partial exit releases only its remainder and preserves proceeds', () => {
  service.bid(2, '1', { shares: 4, price: 95 });
  const request = exit(); openWindow(request.id);
  service.executeExit(1, '1', request.id);
  const desk = service.cancelExit(1, '1', request.id);
  assert.equal(desk.exitRequests[0].status, 'cancelled');
  assert.equal(desk.exitRequests[0].filled, 4);
  assert.equal(desk.exitRequests[0].proceedsUsdc, 380);
  assert.equal(desk.availableShares, 96);
});

test('self bids, insolvent bids and restricted accounts cannot provide executable exit funding', () => {
  persistence.data.users[0].cashCents = 1000000;
  service.bid(1, '1', { shares: 10, price: 95 });
  service.bid(2, '1', { shares: 10, price: 95 });
  const request = exit(); openWindow(request.id);
  persistence.data.users[1].cashCents = 0;
  assert.equal(service.snapshot(1, '1').sellableBids.length, 0);
  assert.throws(() => service.executeExit(1, '1', request.id), /No account-reserved bids/);
  persistence.data.users[1].cashCents = 1000000;
  persistence.data.users[1].restricted = true;
  assert.throws(() => service.executeExit(1, '1', request.id), /No account-reserved bids/);
});

test('ownership, investor roles and paused properties are enforced server side', () => {
  const request = exit();
  assert.throws(() => service.cancelExit(2, '1', request.id), { status: 403 });
  assert.throws(() => service.executeExit(2, '1', request.id), { status: 403 });
  assert.throws(() => service.bid(4, '1', { shares: 1, price: 90 }), { status: 403 });
  assert.throws(() => exit(4), { status: 403 });
  persistence.data.properties[0].platform = { tradingPaused: true };
  assert.throws(() => service.bid(2, '1', { shares: 1, price: 90 }), { status: 403 });
  assert.throws(() => exit(1), { status: 403 });
  assert.equal(service.cancelExit(1, '1', request.id).exitRequests[0].status, 'cancelled');
});

test('processing settles earlier matching requests first without requiring their owners online', () => {
  const earlier = exit(3, 10, 100); openWindow(earlier.id);
  const later = exit(1, 10, 90); openWindow(later.id);
  service.bid(2, '1', { shares: 10, price: 95 });
  assert.equal(service.executeExit(1, '1', later.id).exitRequests[0].status, 'completed');
  service.bid(2, '1', { shares: 20, price: 110 });
  const newest = exit(1, 10, 90); openWindow(newest.id);
  assert.equal(service.executeExit(1, '1', newest.id).exitRequests[0].status, 'completed');
  assert.equal(service.snapshot(3, '1').exitRequests[0].status, 'completed');
  assert.equal(service.snapshot(3, '1').exitRequests[0].proceedsUsdc, 1100);
});

test('Friday windows and invalid inputs behave predictably', () => {
  assert.equal(service.nextWindow(Date.parse('2026-10-16T15:59:00Z')), '2026-10-16T16:00:00.000Z');
  assert.equal(service.nextWindow(Date.parse('2026-10-16T16:00:00Z')), '2026-10-23T16:00:00.000Z');
  for (const shares of [0, 1.5, -1, Infinity, 5001]) assert.throws(() => service.createExit(1, '1', { shares, price: 90 }), /whole shares/);
  assert.throws(() => service.createExit(1, '1', { shares: 1, price: 0 }), /valid price/);
  assert.throws(() => service.createExit(1, '1', { shares: 1, price: 90, windowWeeks: 3 }), /processing window/);
});

test('new liquidity metrics never expose other investor identities or queue records', () => {
  exit(3);
  service.bid(2, '1', { shares: 10, price: 90 });
  const data = service.snapshot(1, '1');
  assert.deepEqual(data.exitRequests, []);
  assert.equal(data.ownBids.length, 0);
  assert.ok(!JSON.stringify(data).includes('Other seller'));
  assert.ok(!JSON.stringify(data).includes('userId'));
});

test('open account orders survive retention and fill counts update on maker orders', () => {
  for (let i = 0; i < 245; i += 1) market.place(2, { propertyId: '1', side: 'bid', shares: 1, price: .01, open: true });
  assert.equal(service.snapshot(2, '1').ownBids.length, 245);
  assert.equal(market.availableCashCents(persistence.data.users[1]), 1000000 - 245);
  const order = persistence.data.market.orders[0];
  market.consume(order, 1);
  assert.equal(order.filled, 1);
  assert.equal(order.status, 'filled');
});

test('liquidity API authenticates writes and returns the updated property-specific queue', async () => {
  const express = require('express');
  const http = require('node:http');
  const jwt = require('jsonwebtoken');
  const app = express();
  app.use(express.json());
  app.use('/api/market', require('../routes/market'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/market/liquidity/1`;
  const token = (id) => jwt.sign({ sub: String(id) }, process.env.JWT_SECRET || 'jwt_secret');
  const call = async (path, id, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${token(id)}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await call('', null)).status, 401);
    const bid = await call('/bids', 2, 'POST', { shares: 10, price: 95 });
    assert.equal(bid.status, 201);
    assert.equal(bid.data.ownBids.length, 1);
    const requested = await call('/exits', 1, 'POST', { shares: 10, price: 90, windowWeeks: 1 });
    assert.equal(requested.status, 201);
    const id = requested.data.exitRequests[0].id;
    assert.equal((await call(`/exits/${id}`, 2, 'DELETE')).status, 403);
    assert.equal((await call(`/exits/${id}/process`, 1, 'POST', {})).status, 409);
    openWindow(id);
    const settled = await call(`/exits/${id}/process`, 1, 'POST', {});
    assert.equal(settled.status, 200);
    assert.equal(settled.data.exitRequests[0].status, 'completed');
    assert.equal(settled.data.exitRequests[0].proceedsUsdc, 950);
    assert.equal((await call('', 2)).data.exitRequests.length, 0);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});


test('earlier requests consume funding first and later requests keep their remaining reservations', () => {
  const earlier = exit(3, 10, 90); openWindow(earlier.id);
  const later = exit(1, 10, 90); openWindow(later.id);
  service.bid(2, '1', { shares: 12, price: 95 });
  const laterDesk = service.executeExit(1, '1', later.id);
  assert.equal(service.snapshot(3, '1').exitRequests[0].filled, 10);
  assert.equal(laterDesk.exitRequests[0].filled, 2);
  assert.equal(laterDesk.exitRequests[0].remaining, 8);
  assert.equal(laterDesk.exitRequests[0].status, 'partially_filled');
  assert.equal(laterDesk.availableShares, 90);
  assert.equal(persistence.data.users.reduce((sum, user) => sum + user.cashCents, 0), 3000000);
  assert.equal(persistence.data.users.reduce((sum, user) => sum + (user.shareBalances[1] || 0), 0), 300);
});
