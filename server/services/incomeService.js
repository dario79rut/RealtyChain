const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function account(id) { const user = persistence.data.users.find((row) => String(row.id) === String(id)); if (!user) fail('Unauthorized.', 401); return user; }
function property(id) { const row = persistence.data.properties.find((item) => String(item.id) === String(id)); if (!row) fail('Property not found.', 404); return row; }
function reports() { return persistence.data.incomeReports || []; }
function admin(id) { const user = account(id); if (user.role !== 'admin') fail('Admin access required.', 403); return user; }
function cents(value, label) { const n = Number(value); if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) fail(`${label} must be a nonnegative amount.`); return Math.round(n * 100); }
function publicReport(row) {
  const { payments, fundingUserId, createdBy, ...record } = row;
  return { ...record, eligibleAccountCount: payments?.length || 0 };
}
function snapshot(userId, propertyId) {
  const user = account(userId); const asset = property(propertyId);
  const rows = reports().filter((row) => row.propertyId === String(propertyId)).sort((a, b) => b.period.localeCompare(a.period));
  const ownPayments = rows.flatMap((row) => (row.payments || []).filter((payment) => String(payment.userId) === String(user.id))
    .map(({ userId: _id, ...payment }) => ({ ...payment, period: row.period, reportId: row.id })));
  return { propertyId: String(asset.id), asOf: new Date().toISOString(), reports: rows.map(publicReport), ownPayments,
    totalReportedRent: rows.reduce((sum, row) => sum + row.rentCollected, 0),
    totalLedgerPaid: rows.reduce((sum, row) => sum + (row.paidUsdc || 0), 0),
    fundingAccountConfigured: Boolean(asset.ownerId && persistence.data.users.some((row) => String(row.id) === String(asset.ownerId))),
    canManage: user.role === 'admin', demoMode: process.env.DEMO_MODE !== 'false',
    indexedClaims: (persistence.data.activity?.events || []).filter((event) => String(event.propertyId) === String(propertyId) && event.type === 'claim')
      .map((event) => ({ id: event.id, at: event.timestamp ? new Date(event.timestamp * 1000).toISOString() : null, amountUsdc: Number(event.usdc || 0) / 1e6, transaction: event.txHash || null })),
    legacyPosted: (persistence.data.distributions || []).filter((row) => String(row.propertyId) === String(propertyId)).map((row) => ({ id: row.id, at: row.at, amount: row.investor, status: 'posted_unconfirmed' })),
  };
}
function create(userId, propertyId, input) {
  admin(userId); property(propertyId);
  if (typeof input.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || input.period > new Date().toISOString().slice(0, 7)) fail('Choose a current or past reporting month.');
  if (reports().some((row) => row.propertyId === String(propertyId) && row.period === input.period)) fail('An income report already exists for this month.', 409);
  const source = String(input.sourceReference || '').trim();
  if (source.length < 5 || source.length > 500) fail('Provide a source reference of 5–500 characters.');
  const rent = cents(input.rentCollected, 'Collected rent');
  const expenses = cents(input.operatingExpenses, 'Expenses');
  const reserves = cents(input.reserves, 'Reserves');
  const distribution = cents(input.distributionBudget, 'Distribution budget');
  if (expenses + reserves > rent || distribution > rent - expenses - reserves) fail('Expenses, reserves and the distribution budget must fit within collected rent.');
  const row = { id: `income-${crypto.randomBytes(8).toString('hex')}`, propertyId: String(propertyId), period: input.period,
    rentCollected: market.dollars(rent), operatingExpenses: market.dollars(expenses), reserves: market.dollars(reserves), netIncome: market.dollars(rent - expenses - reserves),
    distributionBudget: market.dollars(distribution), sourceReference: source, verification: 'admin_attested_unverified', status: 'reported',
    createdBy: String(userId), createdAt: new Date().toISOString(), paidUsdc: 0, payments: [] };
  if (!Array.isArray(persistence.data.incomeReports)) persistence.data.incomeReports = [];
  persistence.data.incomeReports.push(row); persistence.save(); return snapshot(userId, propertyId);
}
function pay(userId, propertyId, reportId) {
  admin(userId); market.ensureStore(); const asset = property(propertyId);
  const row = reports().find((report) => report.id === reportId && report.propertyId === String(propertyId));
  if (!row) fail('Income report not found.', 404);
  if (row.status !== 'reported') fail('This report has already been processed.', 409);
  const funder = account(asset.ownerId);
  if (funder.suspended || funder.restricted) fail('The property funding account is restricted.', 403);
  const supply = Number(asset.totalTokens);
  if (!Number.isSafeInteger(supply) || supply < 1) fail('The property needs a valid share supply.');
  const budget = Math.round(row.distributionBudget * 100);
  const allocations = persistence.data.users.filter((user) => (!user.role || user.role === 'user') && !user.suspended && !user.restricted)
    .map((user) => ({ user, shares: Math.max(0, Math.floor(Number(user.shareBalances?.[propertyId] || 0))) }))
    .filter((item) => item.shares > 0)
    .map((item) => ({ ...item, cents: Number(BigInt(budget) * BigInt(item.shares) / BigInt(supply)) })).filter((item) => item.cents > 0);
  const total = allocations.reduce((sum, item) => sum + item.cents, 0);
  if (!total) fail('No eligible ledger holders have a payable allocation.');
  if (allocations.reduce((sum, item) => sum + item.shares, 0) > supply || total > budget) fail('Recorded holdings exceed the catalog share supply; reconcile the register before paying.');
  if (market.availableCashCents(funder) < total) fail('The property funding account has insufficient unreserved USDC.');
  const now = new Date().toISOString(); funder.cashCents -= total;
  row.payments = allocations.map(({ user, shares, cents: amount }) => {
    user.cashCents = Number(user.cashCents || 0) + amount;
    return { id: `pay-${crypto.randomBytes(8).toString('hex')}`, userId: String(user.id), shares, amountUsdc: market.dollars(amount), at: now, settlement: 'application_ledger' };
  });
  Object.assign(row, { status: 'ledger_paid', paidAt: now, fundingUserId: String(funder.id), paidUsdc: market.dollars(total), unallocatedUsdc: market.dollars(budget - total), supplyAtPayment: supply });
  persistence.save(); return snapshot(userId, propertyId);
}
module.exports = { snapshot, create, pay };
