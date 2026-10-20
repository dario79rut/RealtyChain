const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');
const liquidity = require('./liquidityService');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function plans() { return persistence.data.investmentPlans || []; }
function userById(id) { const user = persistence.data.users.find((row) => String(row.id) === String(id)); if (!user) fail('Unauthorized.', 401); return user; }
function eligible(user) { return user && (!user.role || user.role === 'user') && !user.suspended && !user.restricted && user.kycStatus === 'approved' && user.accredited; }
function asset(id) { const property = persistence.data.properties.find((row) => String(row.id) === String(id)); if (!property) fail('Property not found.', 404); return property; }
function tradable(property) { return !(property.platform?.suspended || property.platform?.tradingPaused || property.platform?.transfersRestricted || property.redemptionAddress); }
function owned(userId, id) { const plan = plans().find((row) => row.id === id); if (!plan) fail('Plan not found.', 404); if (plan.userId !== String(userId)) fail('That plan is not yours.', 403); return plan; }
function nextDate(previous, frequency, anchorDay) {
  const next = new Date(previous);
  if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else { next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1); const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(); next.setUTCDate(Math.min(anchorDay, last)); }
  return next.toISOString();
}
function snapshot(userId, propertyId) {
  const user = userById(userId);
  return { asOf: new Date().toISOString(), schedulerConfigured: (process.env.INVESTMENT_SCHEDULER_SECRET || '').length >= 32 && Boolean(process.env.NETLIFY || process.env.URL), eligible: Boolean(eligible(user)),
    plans: plans().filter((row) => row.userId === String(userId) && (!propertyId || row.propertyId === String(propertyId))).map(({ userId: _user, ...row }) => row),
    execution: 'application_ledger', runnerCadence: 'Daily at 14:00 UTC when configured; Run due now is available manually.' };
}
function create(userId, input) {
  market.ensureStore(); const user = userById(userId);
  if (!eligible(user)) fail('Approved KYC, accreditation and an unrestricted investor account are required.', 403);
  const property = asset(input.propertyId); if (!tradable(property)) fail('Trading is unavailable for this property.', 403);
  if (input.authorized !== true) fail('Authorize purchases within the recorded budget and price limit.');
  if (!['weekly', 'monthly', 'reinvest'].includes(input.frequency)) fail('Choose weekly, monthly, or distribution reinvestment.');
  const budgetCents = Math.round(Number(input.budgetUsdc) * 100); const maximumCents = Math.round(Number(input.maxPrice) * 100);
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 1 || !Number.isSafeInteger(maximumCents) || maximumCents < 1) fail('Enter a positive budget and maximum share price.');
  if (plans().some((row) => row.userId === String(userId) && row.propertyId === String(property.id) && row.frequency === input.frequency && row.status !== 'cancelled')) fail('An active or paused plan of this type already exists for this property.', 409);
  const day = String(input.startDate || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day || day < new Date().toISOString().slice(0, 10)) fail('Choose today or a future start date.');
  const now = new Date().toISOString();
  const row = { id: `plan-${crypto.randomBytes(8).toString('hex')}`, userId: String(userId), propertyId: String(property.id), propertyTitle: property.title,
    frequency: input.frequency, budgetUsdc: budgetCents / 100, maxPrice: maximumCents / 100, status: 'active', createdAt: now,
    nextRunAt: input.frequency === 'reinvest' && day === now.slice(0, 10) ? now : `${day}T14:00:00.000Z`, anchorDay: Number(day.slice(8)), authorization: 'ledger-account-asks-v1', authorizedAt: now,
    spentUsdc: 0, sharesBought: 0, processedIncomeIds: [], history: [] };
  if (!Array.isArray(persistence.data.investmentPlans)) persistence.data.investmentPlans = [];
  persistence.data.investmentPlans.push(row); persistence.save(); return snapshot(userId, property.id);
}
function change(userId, id, status) {
  userById(userId); const row = owned(userId, id);
  if (!['active', 'paused', 'cancelled'].includes(status) || row.status === 'cancelled') fail('Choose an available plan status.');
  if (status === 'active' && !eligible(userById(userId))) fail('This account is not eligible for automated purchases.', 403);
  row.status = status; row.updatedAt = new Date().toISOString(); persistence.save(); return snapshot(userId, row.propertyId);
}
function purchase(plan, user, budgetCents) {
  const available = Math.min(budgetCents, market.availableCashCents(user));
  let left = available; let sharesBought = 0; let spent = 0;
  const asks = liquidity.backedOrders(plan.propertyId, 'ask').filter((order) => String(order.userId) !== String(user.id) && order.priceCents <= Math.round(plan.maxPrice * 100));
  for (const order of asks) {
    const take = Math.min(order.remaining, Math.floor(left / order.priceCents), 5000 - sharesBought);
    if (take <= 0) continue;
    const seller = persistence.data.users.find((row) => String(row.id) === String(order.userId));
    market.applyFill(user, seller, plan.propertyId, take, order.priceCents, 'buy'); market.consume(order, take);
    sharesBought += take; spent += take * order.priceCents; left -= take * order.priceCents;
    if (sharesBought >= 5000) break;
  }
  return { shares: sharesBought, spentUsdc: spent / 100 };
}
function processPlan(plan, now) {
  const user = userById(plan.userId); const property = asset(plan.propertyId);
  if (!eligible(user) || !tradable(property)) return { id: plan.id, status: 'ineligible' };
  let payment;
  if (plan.frequency === 'reinvest') {
    const processed = new Set(plans().filter((row) => row.userId === plan.userId).flatMap((row) => row.processedIncomeIds || []));
    payment = (persistence.data.incomeReports || []).filter((row) => row.propertyId === plan.propertyId && row.status === 'ledger_paid')
      .flatMap((row) => row.payments || []).filter((row) => String(row.userId) === plan.userId && row.at >= (plan.createdAt > plan.nextRunAt ? plan.createdAt : plan.nextRunAt) && !processed.has(row.id))
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    if (!payment || Date.parse(plan.nextRunAt) > now) { plan.lastCheckedAt = new Date(now).toISOString(); return { id: plan.id, status: 'not_due' }; }
  } else if (Date.parse(plan.nextRunAt) > now) return { id: plan.id, status: 'not_due' };
  const budget = Math.min(Math.round(plan.budgetUsdc * 100), payment ? Math.round(payment.amountUsdc * 100) : Infinity);
  const result = purchase(plan, user, budget);
  const at = new Date(now).toISOString();
  plan.history.unshift({ id: crypto.randomUUID(), at, ...result, status: result.shares ? 'executed' : 'deferred', incomePaymentId: payment?.id || null,
    note: result.shares ? 'Whole shares purchased from account-backed asks. Unspent budget remains in cash.' : 'No affordable account-backed asks within the price limit, or insufficient unreserved cash. No purchase made.' });
  plan.history = plan.history.slice(0, 50); plan.lastRunAt = at;
  if (result.shares) {
    plan.spentUsdc = Math.round((plan.spentUsdc + result.spentUsdc) * 100) / 100; plan.sharesBought += result.shares;
    if (payment) plan.processedIncomeIds.push(payment.id);
    else { let next = plan.nextRunAt; do { next = nextDate(next, plan.frequency, plan.anchorDay); } while (Date.parse(next) <= now); plan.nextRunAt = next; }
  }
  return { id: plan.id, status: result.shares ? 'executed' : 'deferred', ...result };
}
function runDue(userId, propertyId, now = Date.now()) {
  market.ensureStore(); userById(userId);
  const results = plans().filter((row) => row.userId === String(userId) && row.status === 'active' && (!propertyId || row.propertyId === String(propertyId))).map((row) => processPlan(row, now));
  if (results.some((row) => ['executed', 'deferred'].includes(row.status))) persistence.save();
  return { ...snapshot(userId, propertyId), results };
}
function runAll(now = Date.now()) {
  market.ensureStore(); const active = plans().filter((row) => row.status === 'active');
  const results = active.slice(0, 200).map((row) => { row.lastCheckedAt = new Date(now).toISOString(); try { return processPlan(row, now); } catch (error) { return { id: row.id, status: 'error', error: error.message }; } });
  if (results.length) persistence.save();
  return { processed: results.length, executed: results.filter((row) => row.status === 'executed').length, deferred: results.filter((row) => row.status === 'deferred').length, results };
}
module.exports = { snapshot, create, change, runDue, runAll, nextDate };
