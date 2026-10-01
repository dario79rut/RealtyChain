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
      .filter((user) => String(user.email || '').startsWith('mkt-'))
      .map((user) => String(user.id))
  );
  persistence.data.users = (persistence.data.users || []).filter(
    (user) => !String(user.email || '').startsWith('mkt-')
  );
  if (persistence.data.market) {
    persistence.data.market.orders = (persistence.data.market.orders || []).filter(
      (order) => !testIds.has(String(order.userId))
    );
    persistence.data.market.trades = (persistence.data.market.trades || []).filter(
      (trade) => !testIds.has(String(trade.buyerId)) && !testIds.has(String(trade.sellerId))
    );
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
  const email = `mkt-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = 'pass1234';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, username: 'Market User' },
  });
  assert.equal(registered.status, 201);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200);
  return login.data.token;
}

test('the market book requires auth', async () => {
  const res = await request('/api/market');
  assert.equal(res.status, 401);
});

test('a holder can bid, buy the ask, sell the bid, and cancel', async () => {
  const token = await register();
  const book = await request('/api/market', { token });
  assert.equal(book.status, 200);
  const quote = book.data.quotes.find((row) => row.propertyId === '1');
  assert.ok(quote.bid > 0);
  assert.ok(quote.ask > quote.bid);
  const position = book.data.positions.find((row) => row.propertyId === '1');
  assert.equal(position.shares, 40);
  assert.equal(book.data.cashUsdc, 50000);
  const asks = book.data.books['1'].asks;
  const bestAsk = asks[asks.length - 1];
  assert.ok(bestAsk.shares > 0);

  const resting = await request('/api/market/orders', {
    method: 'POST',
    token,
    body: { propertyId: '1', side: 'bid', price: round2(quote.bid * 0.9), shares: 2 },
  });
  assert.equal(resting.status, 201);
  assert.equal(resting.data.orders.length, 1);
  assert.equal(resting.data.orders[0].side, 'bid');
  assert.equal(
    resting.data.cashReserved,
    Math.round(resting.data.orders[0].price * resting.data.orders[0].shares * 100) / 100
  );

  const bought = await request('/api/market/orders', {
    method: 'POST',
    token,
    body: { propertyId: '1', side: 'bid', price: bestAsk.price, shares: 1 },
  });
  assert.equal(bought.status, 201);
  const afterBuy = bought.data.positions.find((row) => row.propertyId === '1');
  assert.equal(afterBuy.shares, 41);
  assert.ok(bought.data.cashUsdc < 50000);
  assert.equal(bought.data.trades[0].side, 'buy');
  assert.equal(bought.data.trades[0].shares, 1);

  const bestBid = bought.data.books['1'].bids[0];
  const sold = await request('/api/market/orders', {
    method: 'POST',
    token,
    body: { propertyId: '1', side: 'ask', price: bestBid.price, shares: 1 },
  });
  assert.equal(sold.status, 201);
  const afterSell = sold.data.positions.find((row) => row.propertyId === '1');
  assert.equal(afterSell.shares, 40);
  assert.equal(sold.data.trades[0].side, 'sell');

  const tooMany = await request('/api/market/orders', {
    method: 'POST',
    token,
    body: { propertyId: '4', side: 'ask', price: 100, shares: 1 },
  });
  assert.equal(tooMany.status, 400);

  const cancelled = await request(`/api/market/orders/${resting.data.orders[0].id}`, {
    method: 'DELETE',
    token,
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.orders.length, 0);
  assert.equal(cancelled.data.cashReserved, 0);
});

function round2(value) {
  return Math.round(value * 100) / 100;
}
