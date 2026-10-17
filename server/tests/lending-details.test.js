const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const persistence = { data: {}, save() {} };
let mark;
const market = {
  dollars: (cents) => Math.round(cents) / 100,
  markCents: () => mark,
  findUser: (id) => persistence.data.users.find((user) => String(user.id) === String(id)),
  availableCashCents: (user) => user.cashCents,
  availableShares: (user, propertyId) => (user.shareBalances[propertyId] || 0)
    - (persistence.data.lending.loans.find((loan) => loan.userId === user.id)?.collateral || [])
      .filter((line) => line.propertyId === propertyId).reduce((sum, line) => sum + line.shares, 0),
};
require.cache[require.resolve('../mock/persistence')] = { exports: persistence };
require.cache[require.resolve('../services/marketService')] = { exports: market };
const lending = require('../services/lendingService');

beforeEach(() => {
  mark = 10000;
  persistence.data = {
    users: [
      { id: 1, name: 'Alice Private', role: 'user', cashCents: 1000000, shareBalances: { 1: 100 } },
      { id: 2, name: 'Bob Private', role: 'user', cashCents: 1000000, shareBalances: { 1: 100 } },
    ],
    properties: [{ id: 1, title: 'Test property' }],
    lending: { poolCents: 1000000, supplies: [], loans: [] },
  };
});

test('pool totals and pseudonymous exposure show exact pledged assets without exposing account identity', () => {
  lending.supply(1, { usdc: 1000 });
  lending.borrow(2, { propertyId: '1', shares: 20, usdc: 800 });
  const desk = lending.snapshot(1);
  assert.equal(desk.pool.supplierCount, 1);
  assert.equal(desk.pool.borrowerCount, 1);
  assert.equal(desk.pool.suppliedPrincipal, 1000);
  assert.equal(desk.pool.outstandingDebt, 800);
  assert.equal(desk.poolUsdc, 10200);
  assert.equal(desk.positions[0].borrowerId, undefined);
  assert.match(desk.positions[0].borrower, /^Borrower /);
  assert.ok(!JSON.stringify(desk.positions).includes('Bob Private'));
  assert.deepEqual(desk.positions[0].collateral[0], { propertyId: '1', title: 'Test property', shares: 20, mark: 100, value: 2000 });
  assert.equal(lending.snapshot(2).positions[0].borrower, 'You');
  assert.ok(Number.isFinite(Date.parse(desk.asOf)));
});

test('history is account-specific and records actual capped withdrawals and repayments', () => {
  lending.supply(1, { usdc: 1000 });
  lending.withdraw(1, { usdc: 2000 });
  lending.borrow(2, { propertyId: '1', shares: 20, usdc: 800 });
  lending.repay(2, { usdc: 900 });
  const alice = lending.snapshot(1);
  assert.deepEqual(alice.activity.map((row) => [row.action, row.usdc]), [['withdraw', 1000], ['supply', 1000]]);
  assert.ok(alice.activity.every((row) => !('userId' in row)));
  const bob = lending.snapshot(2);
  assert.deepEqual(bob.activity.map((row) => [row.action, row.usdc]), [['repay', 800], ['borrow', 800]]);
  assert.equal(bob.activity[1].shares, 20);
  assert.equal(bob.activity[1].propertyId, '1');
  assert.equal(bob.loan, null);
  assert.equal(bob.pool.borrowerCount, 0);
});

test('failed borrowing and release attempts do not create successful activity records', () => {
  assert.throws(() => lending.borrow(1, { propertyId: '1', shares: 10, usdc: 600 }), /50%/);
  assert.equal(lending.snapshot(1).activity.length, 0);
  lending.borrow(1, { propertyId: '1', shares: 20, usdc: 800 });
  assert.throws(() => lending.release(1, { propertyId: '1', shares: 20 }), /50%/);
  assert.deepEqual(lending.snapshot(1).activity.map((row) => row.action), ['borrow']);
  lending.release(1, { propertyId: '1', shares: 2 });
  assert.equal(lending.snapshot(1).activity[0].action, 'release');
  assert.equal(lending.snapshot(1).activity[0].shares, 2);
});

test('liquidation at a falling mark records separate history for both parties', () => {
  const desk = lending.borrow(2, { propertyId: '1', shares: 20, usdc: 800 });
  const loanId = desk.loan.id;
  assert.throws(() => lending.liquidate(1, loanId), /not at the liquidation threshold/);
  mark = 6000;
  const exposed = lending.snapshot(1);
  assert.equal(exposed.positions[0].health, 'liquidatable');
  lending.liquidate(1, loanId);
  assert.equal(lending.snapshot(1).activity[0].action, 'liquidate');
  assert.equal(lending.snapshot(2).activity[0].action, 'liquidated');
  assert.equal(lending.snapshot(2).loan, null);
  assert.equal(persistence.data.users[0].shareBalances[1], 115); // ceil(800 × 1.08 / 60)
  assert.equal(persistence.data.users[1].shareBalances[1], 85);
});

test('legacy books with no audit history remain readable and report no fabricated actions', () => {
  const desk = lending.snapshot(1);
  assert.deepEqual(desk.activity, []);
  assert.deepEqual(desk.positions, []);
  assert.equal(desk.pool.supplierCount, 0);
});


test('exposure and eligibility include accrued interest while keeping principal separate', () => {
  lending.borrow(2, { propertyId: '1', shares: 20, usdc: 800 });
  persistence.data.lending.loans[0].accruedCents = 50000;
  const desk = lending.snapshot(1);
  assert.equal(desk.positions[0].principal, 800);
  assert.equal(desk.positions[0].interest, 500);
  assert.equal(desk.positions[0].debt, 1300);
  assert.equal(desk.positions[0].ltv, 0.65);
  assert.equal(desk.positions[0].health, 'liquidatable');
  assert.equal(desk.pool.outstandingDebt, 1300);
  assert.equal(desk.liquidations[0].borrowerId, undefined);
  assert.ok(!JSON.stringify(desk.liquidations).includes('Bob Private'));
  assert.equal(desk.terms.borrowApr, lending.ratesFor().borrowAprBps / 10000);
  assert.equal(desk.terms.supplyApr, lending.ratesFor().supplyAprBps / 10000);
});

test('history returns the latest 50 entries newest first and excludes other accounts', () => {
  persistence.data.lending.activity = Array.from({ length: 60 }, (_, index) => ({
    id: `entry-${index}`, userId: '1', action: 'supply', usdc: index + 1,
    at: new Date(1700000000000 + index * 1000).toISOString(),
  }));
  persistence.data.lending.activity.push({ id: 'private', userId: '2', action: 'supply', usdc: 5000 });
  const desk = lending.snapshot(1);
  assert.equal(desk.activity.length, 50);
  assert.equal(desk.activity[0].id, 'entry-59');
  assert.equal(desk.activity[49].id, 'entry-10');
});


test('utilization model prices zero, target and full usage and excludes protected reserves', () => {
  const model = (cash, borrowed) => lending.ratesFor({ poolCents: cash, loans: [{ principalCents: borrowed }] });
  assert.equal(model(10000, 0).borrowAprBps, 200);
  assert.equal(model(10000, 0).supplyAprBps, 0);
  assert.equal(model(2000, 8000).borrowAprBps, 800);
  assert.equal(model(2000, 8000).supplyAprBps, 544);
  assert.equal(model(0, 10000).borrowAprBps, 6800);
  persistence.data.lending.reserveCents = 10000;
  assert.equal(lending.availablePoolCents(), 990000);
});

test('fractional interest carries forward so frequent reads do not erase accrual', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  persistence.data.lending.loans = [{ id: 'carry', userId: 1, principalCents: 100, accruedCents: 0, updatedAt: new Date(start).toISOString(), collateral: [] }];
  persistence.data.lending.poolCents = 100;
  persistence.data.lending.rateState = lending.ratesFor(persistence.data.lending);
  const rate = persistence.data.lending.rateState.borrowAprBps;
  for (let day = 1; day <= 365; day += 1) lending.touch(start + day * 86400000);
  const accrued = persistence.data.lending.loans[0];
  assert.ok(Math.abs(accrued.accruedCents + accrued.interestRemainderCents - rate / 100) < 1e-8);
});

test('repaid interest creates a protected reserve and supplier withdrawals use available pool cash', () => {
  lending.borrow(1, { propertyId: '1', shares: 20, usdc: 800 });
  persistence.data.lending.loans[0].accruedCents = 10000;
  lending.repay(1, { usdc: 100 });
  assert.equal(persistence.data.lending.reserveCents, 1500);
  assert.equal(persistence.data.lending.borrowerInterestReceivedCents, 10000);
  const desk = lending.snapshot(1);
  assert.equal(desk.pool.reserveUsdc, 15);
  assert.equal(desk.pool.grossCashUsdc - desk.poolUsdc, 15);
});
