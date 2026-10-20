const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.DEMO_MODE = 'false';
const persistence = { data: {}, save() {} };
require.cache[require.resolve('../mock/persistence')] = { exports: persistence };
const market = require('../services/marketService');
const income = require('../services/incomeService');
const plans = require('../services/investmentPlanService');
const quotes = require('../services/institutionalQuoteService');
const lending = require('../services/lendingService');
const eligible = { kycStatus: 'approved', accredited: true };
beforeEach(() => {
  persistence.data = {
    users: [
      { id: 1, name: 'Investor One', role: 'user', ...eligible, cashCents: 100000, shareBalances: { 1: 20 } },
      { id: 2, name: 'Investor Two', role: 'user', ...eligible, cashCents: 100000, shareBalances: { 1: 30 } },
      { id: 3, name: 'Property Owner', role: 'owner', cashCents: 100000, shareBalances: {} },
      { id: 4, name: 'Operator', role: 'admin', cashCents: 0, shareBalances: {} },
      { id: 5, name: 'Institution Buyer', role: 'institution', ...eligible, cashCents: 1000000, shareBalances: {} },
      { id: 6, name: 'Institution Seller', role: 'institution', ...eligible, cashCents: 0, shareBalances: { 1: 40 } },
      { id: 7, name: 'Unrelated Institution', role: 'institution', ...eligible, cashCents: 0, shareBalances: {} },
    ],
    properties: [{ id: '1', title: 'Test property', ownerId: 3, totalTokens: 100, price: 10000 }],
    market: { orders: [], trades: [], opens: { 1: 10000 }, exitRequests: [] },
    lending: { poolCents: 1000000, loans: [], supplies: [] },
  };
});
const sumCash = () => persistence.data.users.reduce((sum, user) => sum + user.cashCents, 0);
const report = () => income.create(4, '1', { period: new Date().toISOString().slice(0, 7), rentCollected: 1000, operatingExpenses: 100, reserves: 100, distributionBudget: 200, sourceReference: 'Accounting register v1' }).reports[0];
const plan = (frequency = 'weekly') => plans.create(1, { propertyId: '1', frequency, budgetUsdc: 250, maxPrice: 100, startDate: new Date().toISOString().slice(0, 10), authorized: true }).plans[0];
const requestedQuote = () => quotes.request(5, { propertyId: '1', side: 'buy', shares: 10, note: 'All-or-none' }).requests[0];
function confirmedQuote() { const row = requestedQuote(); quotes.quote(4, row.id, { counterpartyId: '6', price: 100, validHours: 24 }); quotes.confirm(6, row.id); return row; }

test('income reporting is sourced and does not claim a posted report has paid anyone', () => {
  const before = sumCash(); const row = report();
  assert.equal(row.status, 'reported'); assert.equal(row.paidUsdc, 0); assert.equal(sumCash(), before);
  assert.equal(row.verification, 'admin_attested_unverified');
  assert.throws(() => report(), { status: 409 });
  assert.throws(() => income.create(1, '1', {}), { status: 403 });
});

test('funded income payments conserve cash, use supply snapshots, remain private and cannot repeat', () => {
  const row = report(); const before = sumCash();
  const desk = income.pay(4, '1', row.id);
  assert.equal(desk.reports[0].paidUsdc, 100);
  assert.equal(desk.reports[0].unallocatedUsdc, 100);
  assert.equal(persistence.data.users[0].cashCents, 104000);
  assert.equal(persistence.data.users[1].cashCents, 106000);
  assert.equal(persistence.data.users[2].cashCents, 90000);
  assert.equal(sumCash(), before);
  assert.equal(income.snapshot(1, '1').ownPayments[0].amountUsdc, 40);
  assert.equal(income.snapshot(1, '1').ownPayments.length, 1);
  assert.ok(!JSON.stringify(desk.reports).includes('userId'));
  assert.throws(() => income.pay(4, '1', row.id), { status: 409 });
});

test('unfunded or overallocated income payments cannot manufacture balances', () => {
  const row = report(); persistence.data.users[2].cashCents = 0;
  const before = sumCash();
  assert.throws(() => income.pay(4, '1', row.id), /insufficient unreserved/);
  assert.equal(sumCash(), before); assert.equal(income.snapshot(1, '1').reports[0].status, 'reported');
  persistence.data.users[2].cashCents = 100000;
  persistence.data.users[0].shareBalances[1] = 1000;
  assert.throws(() => income.pay(4, '1', row.id), /holdings exceed/);
});

test('recurring purchases enforce authorization, due dates, budgets, price limits and single-cycle execution', () => {
  assert.throws(() => plans.create(1, { propertyId: '1', frequency: 'weekly', budgetUsdc: 250, maxPrice: 100, authorized: false }), /Authorize/);
  const row = plan();
  market.place(2, { propertyId: '1', side: 'ask', shares: 10, price: 90, open: true });
  const before = sumCash();
  assert.equal(plans.runDue(1, '1', Date.parse(row.nextRunAt) - 1).plans[0].sharesBought, 0);
  const executed = plans.runDue(1, '1', Date.parse(row.nextRunAt)).plans[0];
  assert.equal(executed.sharesBought, 2); assert.equal(executed.spentUsdc, 180);
  assert.equal(sumCash(), before);
  assert.equal(plans.runDue(1, '1', Date.parse(row.nextRunAt)).plans[0].sharesBought, 2);
  assert.equal(market.availableShares(persistence.data.users[1], '1'), 20);
  assert.throws(() => plans.change(2, row.id, 'paused'), { status: 403 });
});

test('synthetic asks and offers above the authorized maximum do not trigger plan purchases', () => {
  const row = plan();
  market.place(2, { propertyId: '1', side: 'ask', shares: 10, price: 101, open: true });
  persistence.data.market.orders.push({ id: 'book-fake', userId: null, propertyId: '1', side: 'ask', status: 'open', remaining: 1000, priceCents: 100, createdAt: new Date().toISOString() });
  assert.equal(plans.runDue(1, '1', Date.parse(row.nextRunAt)).plans[0].history[0].status, 'deferred');
  assert.equal(persistence.data.market.trades.length, 0);
  plans.change(1, row.id, 'paused');
  assert.deepEqual(plans.runDue(1, '1', Date.parse(row.nextRunAt)).results, []);
});

test('new funded distributions can be reinvested once while reports alone create no allowance', () => {
  const row = plan('reinvest');
  const reported = report();
  market.place(2, { propertyId: '1', side: 'ask', shares: 10, price: 10, open: true });
  assert.equal(plans.runDue(1, '1', Date.parse(row.nextRunAt) + 1000).plans[0].sharesBought, 0);
  income.pay(4, '1', reported.id);
  const runAt = Math.max(Date.now(), Date.parse(row.nextRunAt));
  const executed = plans.runDue(1, '1', runAt).plans[0];
  assert.equal(executed.sharesBought, 4); assert.equal(executed.spentUsdc, 40);
  assert.equal(plans.runDue(1, '1', runAt + 1000).plans[0].sharesBought, 4);
});

test('monthly scheduling preserves month-end anchors', () => {
  assert.equal(plans.nextDate('2027-01-31T14:00:00.000Z', 'monthly', 31), '2027-02-28T14:00:00.000Z');
  assert.equal(plans.nextDate('2027-02-28T14:00:00.000Z', 'monthly', 31), '2027-03-31T14:00:00.000Z');
});

test('institutional RFQs are private, role-protected and reserve nothing before counterparty consent', () => {
  const row = requestedQuote();
  assert.throws(() => quotes.request(1, { propertyId: '1', shares: 10, side: 'buy' }), { status: 403 });
  quotes.quote(4, row.id, { counterpartyId: '6', price: 100, validHours: 24 });
  assert.equal(market.availableShares(persistence.data.users[5], '1'), 40);
  assert.equal(quotes.snapshot(7).requests.length, 0);
  assert.throws(() => quotes.confirm(5, row.id), { status: 403 });
  quotes.confirm(6, row.id);
  assert.equal(market.availableShares(persistence.data.users[5], '1'), 30);
  assert.throws(() => quotes.accept(7, row.id), { status: 403 });
});

test('accepted institutional quotes reserve both sides and settle all-or-none without creating cash or shares', () => {
  const row = confirmedQuote(); const before = sumCash();
  quotes.accept(5, row.id);
  assert.equal(market.availableCashCents(persistence.data.users[4]), 900000);
  assert.throws(() => lending.borrow(6, { propertyId: '1', shares: 31, usdc: 1 }), /Not enough free shares/);
  assert.throws(() => quotes.settle(5, row.id), { status: 403 });
  const settled = quotes.settle(4, row.id).requests[0];
  assert.equal(settled.status, 'settled'); assert.ok(settled.settlementReference.startsWith('trd-'));
  assert.equal(sumCash(), before);
  assert.equal(persistence.data.users[4].shareBalances[1], 10);
  assert.equal(persistence.data.users[5].shareBalances[1], 30);
  assert.equal(market.availableShares(persistence.data.users[5], '1'), 30);
  assert.throws(() => quotes.settle(4, row.id), { status: 409 });
});

test('quote expiry and cancellation release reservations; compliance changes block settlement', () => {
  const row = confirmedQuote();
  persistence.data.institutionalQuotes[0].quoteExpiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(quotes.snapshot(5).requests[0].status, 'expired');
  assert.equal(market.availableShares(persistence.data.users[5], '1'), 40);
  assert.throws(() => quotes.accept(5, row.id), { status: 409 });
  quotes.cancel(6, row.id);
  const next = confirmedQuote(); quotes.accept(5, next.id);
  persistence.data.users[5].restricted = true;
  assert.throws(() => quotes.settle(4, next.id), { status: 403 });
  quotes.cancel(5, next.id);
  assert.equal(market.availableCashCents(persistence.data.users[4]), 1000000);
});

test('capital APIs enforce roles, scheduler authentication and owner-only plan control', async () => {
  const express = require('express'); const http = require('node:http'); const jwt = require('jsonwebtoken');
  const app = express(); app.use(express.json());
  app.use('/api/income', require('../routes/income'));
  app.use('/api/investment-plans', require('../routes/investmentPlans'));
  app.use('/api/institutional-quotes', require('../routes/institutionalQuotes'));
  const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, id, method = 'GET', body, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(id ? { Authorization: `Bearer ${jwt.sign({ sub: String(id) }, process.env.JWT_SECRET || 'jwt_secret')}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  };
  const originalSecret = process.env.INVESTMENT_SCHEDULER_SECRET;
  try {
    assert.equal((await call('/api/income/1')).status, 401);
    assert.equal((await call('/api/income/1', 1, 'POST', {})).status, 403);
    assert.equal((await call('/api/institutional-quotes', 1)).status, 403);
    assert.equal((await call('/api/investment-plans/process-due', null, 'POST', {})).status, 403);
    const created = await call('/api/investment-plans', 1, 'POST', { propertyId: '1', frequency: 'weekly', budgetUsdc: 100, maxPrice: 100, authorized: true });
    assert.equal(created.status, 201);
    const id = created.data.plans[0].id;
    assert.equal((await call(`/api/investment-plans/${id}`, 2, 'PATCH', { status: 'cancelled' })).status, 403);
    process.env.INVESTMENT_SCHEDULER_SECRET = 'test-only-scheduler-secret-32-characters';
    assert.equal((await call('/api/investment-plans/process-due', null, 'POST', {}, { 'X-Scheduler-Secret': 'incorrect' })).status, 403);
    assert.equal((await call('/api/investment-plans/process-due', null, 'POST', {}, { 'X-Scheduler-Secret': process.env.INVESTMENT_SCHEDULER_SECRET })).status, 200);
    const requested = await call('/api/institutional-quotes', 5, 'POST', { propertyId: '1', side: 'buy', shares: 10 });
    assert.equal(requested.status, 201);
    assert.equal((await call(`/api/institutional-quotes/${requested.data.requests[0].id}/quote`, 5, 'POST', {})).status, 403);
  } finally {
    if (originalSecret === undefined) delete process.env.INVESTMENT_SCHEDULER_SECRET; else process.env.INVESTMENT_SCHEDULER_SECRET = originalSecret;
    await new Promise(resolve => server.close(resolve));
  }
});

test('scheduled runner skips missing configuration and sends only one authenticated API request', async () => {
  const { default: handler } = await import('../../netlify/functions/investment-plans.mjs');
  const previous = { secret: process.env.INVESTMENT_SCHEDULER_SECRET, url: process.env.URL, deploy: process.env.DEPLOY_PRIME_URL, fetch: global.fetch };
  try {
    delete process.env.INVESTMENT_SCHEDULER_SECRET;
    assert.equal((await (await handler()).json()).skipped, true);
    process.env.INVESTMENT_SCHEDULER_SECRET = 'test-only-scheduler-secret-at-least-32';
    process.env.URL = 'https://example.test';
    let calls = 0;
    global.fetch = async (url, options) => {
      calls += 1;
      assert.equal(String(url), 'https://example.test/api/investment-plans/process-due');
      assert.equal(options.headers['X-Scheduler-Secret'], process.env.INVESTMENT_SCHEDULER_SECRET);
      return new Response(JSON.stringify({ executed: 1 }), { status: 200 });
    };
    assert.equal((await (await handler()).json()).executed, 1);
    assert.equal(calls, 1);
    global.fetch = async () => { calls += 1; return new Response('{}', { status: 409 }); };
    await assert.rejects(handler(), /no automatic retry/);
    assert.equal(calls, 2);
  } finally {
    for (const [name, value] of [['INVESTMENT_SCHEDULER_SECRET', previous.secret], ['URL', previous.url], ['DEPLOY_PRIME_URL', previous.deploy]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    global.fetch = previous.fetch;
  }
});
