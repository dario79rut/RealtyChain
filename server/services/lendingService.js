const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');

const MAX_LTV_BPS = 5000;
const LIQUIDATION_LTV_BPS = 6500;
const BORROW_APR_BPS = 800;
const SUPPLY_APR_BPS = 400;
const PENALTY_BPS = 800;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SEED_POOL_CENTS = 50_000_000;

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function store() {
  if (!persistence.data.lending || !Array.isArray(persistence.data.lending.loans)) {
    persistence.data.lending = {
      poolCents: SEED_POOL_CENTS,
      supplies: [],
      loans: [],
    };
    persistence.save();
  }
  if (!Array.isArray(persistence.data.lending.supplies)) persistence.data.lending.supplies = [];
  if (persistence.data.lending.poolCents == null) persistence.data.lending.poolCents = SEED_POOL_CENTS;
  return persistence.data.lending;
}

function propertyTitle(id) {
  const row = (persistence.data.properties || []).find((property) => String(property.id) === String(id));
  return row ? row.title : `Property ${id}`;
}

function accrue(row, aprBps, now) {
  const updated = new Date(row.updatedAt || now).getTime();
  const elapsed = Math.max(0, now - updated);
  const interest = Math.floor((Number(row.principalCents) || 0) * (aprBps / 10000) * (elapsed / YEAR_MS));
  if (interest > 0) row.accruedCents = (Number(row.accruedCents) || 0) + interest;
  row.updatedAt = new Date(now).toISOString();
}

function touch(now = Date.now()) {
  const book = store();
  for (const supply of book.supplies) accrue(supply, SUPPLY_APR_BPS, now);
  for (const loan of book.loans) accrue(loan, BORROW_APR_BPS, now);
}

function debtCents(loan) {
  return (Number(loan.principalCents) || 0) + (Number(loan.accruedCents) || 0);
}

function lineValueCents(line) {
  return (Number(line.shares) || 0) * market.markCents(line.propertyId);
}

function collateralValueCents(loan) {
  return (loan.collateral || []).reduce((sum, line) => sum + lineValueCents(line), 0);
}

function ltvBps(loan) {
  const collateral = collateralValueCents(loan);
  const debt = debtCents(loan);
  if (debt <= 0) return 0;
  if (collateral <= 0) return 10000;
  return Math.round((debt / collateral) * 10000);
}

function healthOf(bps) {
  if (bps >= LIQUIDATION_LTV_BPS) return 'liquidatable';
  if (bps >= MAX_LTV_BPS) return 'limited';
  return 'healthy';
}

function userLoan(userId) {
  return store().loans.find((loan) => String(loan.userId) === String(userId)) || null;
}

function userSupply(userId) {
  return store().supplies.find((row) => String(row.userId) === String(userId)) || null;
}

function centsOf(usdc, label) {
  const amount = Number(usdc);
  if (!Number.isFinite(amount) || amount <= 0) fail(`${label} must be greater than 0.`, 400);
  const cents = Math.round(amount * 100);
  if (cents < 1) fail(`${label} is too small.`, 400);
  return cents;
}

function sharesOf(value) {
  const shares = Number(value);
  if (!Number.isInteger(shares) || shares < 1) fail('Enter a whole number of shares.', 400);
  return shares;
}

function presentLine(line) {
  const mark = market.dollars(market.markCents(line.propertyId));
  return {
    propertyId: String(line.propertyId),
    title: propertyTitle(line.propertyId),
    shares: Number(line.shares) || 0,
    mark,
    value: market.dollars((Number(line.shares) || 0) * market.markCents(line.propertyId)),
  };
}

function accountName(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  return (user && (user.name || user.email)) || 'Account';
}

function presentLoan(loan) {
  if (!loan) return null;
  const debt = debtCents(loan);
  const collateral = collateralValueCents(loan);
  const bps = ltvBps(loan);
  const maxDebt = Math.floor(collateral * MAX_LTV_BPS / 10000);
  return {
    id: loan.id,
    borrowerId: loan.userId,
    borrower: accountName(loan.userId),
    debt: market.dollars(debt),
    principal: market.dollars(loan.principalCents || 0),
    interest: market.dollars(loan.accruedCents || 0),
    collateralValue: market.dollars(collateral),
    ltv: bps / 10000,
    health: healthOf(bps),
    maxBorrow: market.dollars(Math.max(0, maxDebt - debt)),
    collateral: (loan.collateral || []).map(presentLine),
  };
}

function collateralOptions(user) {
  return (persistence.data.properties || []).map((property) => {
    const propertyId = String(property.id);
    const held = Math.floor(Number(user.shareBalances?.[propertyId] || 0));
    const locked = (userLoan(user.id)?.collateral || [])
      .filter((line) => String(line.propertyId) === propertyId)
      .reduce((sum, line) => sum + (Number(line.shares) || 0), 0);
    const available = market.availableShares(user, propertyId);
    if (held <= 0 && locked <= 0) return null;
    const markCents = market.markCents(propertyId);
    return {
      propertyId,
      title: property.title,
      shares: held,
      locked,
      available,
      mark: market.dollars(markCents),
      value: market.dollars(held * markCents),
    };
  }).filter(Boolean);
}

function snapshot(userId) {
  touch();
  const user = market.findUser(userId);
  const book = store();
  const supply = userSupply(user.id);
  const mine = userLoan(user.id);
  persistence.save();
  return {
    terms: {
      maxLtv: MAX_LTV_BPS / 10000,
      liquidationLtv: LIQUIDATION_LTV_BPS / 10000,
      borrowApr: BORROW_APR_BPS / 10000,
      supplyApr: SUPPLY_APR_BPS / 10000,
      penalty: PENALTY_BPS / 10000,
    },
    poolUsdc: market.dollars(book.poolCents),
    cashUsdc: market.dollars(market.availableCashCents(user)),
    supply: supply
      ? {
        principal: market.dollars(supply.principalCents || 0),
        interest: market.dollars(supply.accruedCents || 0),
        total: market.dollars((supply.principalCents || 0) + (supply.accruedCents || 0)),
      }
      : null,
    loan: presentLoan(mine),
    collateral: collateralOptions(user),
    liquidations: book.loans
      .filter((loan) => String(loan.userId) !== String(user.id) && ltvBps(loan) >= LIQUIDATION_LTV_BPS)
      .map(presentLoan),
  };
}

function supply(userId, input) {
  touch();
  const user = market.findUser(userId);
  if (user.role === 'admin') fail('Admins do not borrow or supply.', 403);
  if (user.suspended) fail('This account is suspended.', 403);
  if (user.restricted) fail('This account is restricted.', 403);
  const cents = centsOf(input?.usdc, 'Amount');
  if (market.availableCashCents(user) < cents) fail('Not enough USDC.', 400);
  user.cashCents -= cents;
  const book = store();
  book.poolCents += cents;
  let row = userSupply(user.id);
  if (!row) {
    row = { userId: user.id, principalCents: 0, accruedCents: 0, updatedAt: new Date().toISOString() };
    book.supplies.push(row);
  }
  row.principalCents += cents;
  persistence.save();
  return snapshot(user.id);
}

function withdraw(userId, input) {
  touch();
  const user = market.findUser(userId);
  const row = userSupply(user.id);
  if (!row) fail('You have no USDC supplied.', 400);
  const balance = (row.principalCents || 0) + (row.accruedCents || 0);
  const cents = Math.min(centsOf(input?.usdc, 'Amount'), balance, store().poolCents);
  if (cents < 1) fail('The pool cannot cover that withdrawal yet.', 400);
  let left = cents;
  const fromInterest = Math.min(left, row.accruedCents || 0);
  row.accruedCents -= fromInterest;
  left -= fromInterest;
  row.principalCents -= left;
  store().poolCents -= cents;
  user.cashCents += cents;
  if ((row.principalCents || 0) + (row.accruedCents || 0) <= 0) {
    store().supplies = store().supplies.filter((item) => item !== row);
  }
  persistence.save();
  return snapshot(user.id);
}

function lockLine(loan, propertyId, shares) {
  const line = (loan.collateral || []).find((row) => String(row.propertyId) === String(propertyId));
  if (line) line.shares += shares;
  else loan.collateral.push({ propertyId: String(propertyId), shares });
}

function borrow(userId, input) {
  touch();
  const user = market.findUser(userId);
  if (user.role === 'admin') fail('Admins do not borrow or supply.', 403);
  if (user.suspended) fail('This account is suspended.', 403);
  if (user.restricted) fail('This account is restricted.', 403);
  const propertyId = String(input?.propertyId || '');
  const shares = sharesOf(input?.shares);
  const cents = centsOf(input?.usdc, 'Borrow amount');
  if (market.availableShares(user, propertyId) < shares) fail('Not enough free shares to lock.', 400);
  if (store().poolCents < cents) fail('The lending pool does not have that much USDC.', 400);
  let loan = userLoan(user.id);
  if (!loan) {
    loan = {
      id: `loan-${crypto.randomBytes(4).toString('hex')}`,
      userId: user.id,
      principalCents: 0,
      accruedCents: 0,
      updatedAt: new Date().toISOString(),
      collateral: [],
    };
    store().loans.push(loan);
  }
  lockLine(loan, propertyId, shares);
  const maxDebt = Math.floor(collateralValueCents(loan) * MAX_LTV_BPS / 10000);
  if (debtCents(loan) + cents > maxDebt) {
    const line = loan.collateral.find((row) => String(row.propertyId) === propertyId);
    line.shares -= shares;
    if (line.shares <= 0) loan.collateral = loan.collateral.filter((row) => row !== line);
    if (!loan.collateral.length && debtCents(loan) <= 0) {
      store().loans = store().loans.filter((row) => row !== loan);
    }
    fail('That borrow would put the loan over the 50% loan-to-value limit.', 400);
  }
  loan.principalCents += cents;
  store().poolCents -= cents;
  user.cashCents += cents;
  persistence.save();
  return snapshot(user.id);
}

function repay(userId, input) {
  touch();
  const user = market.findUser(userId);
  const loan = userLoan(user.id);
  if (!loan || debtCents(loan) <= 0) fail('You have no loan to repay.', 400);
  const cents = Math.min(centsOf(input?.usdc, 'Repay amount'), debtCents(loan));
  if (market.availableCashCents(user) < cents) fail('Not enough USDC to repay.', 400);
  let left = cents;
  const fromInterest = Math.min(left, loan.accruedCents || 0);
  loan.accruedCents -= fromInterest;
  left -= fromInterest;
  loan.principalCents -= left;
  user.cashCents -= cents;
  store().poolCents += cents;
  if (debtCents(loan) <= 0) {
    store().loans = store().loans.filter((row) => row !== loan);
  }
  persistence.save();
  return snapshot(user.id);
}

function release(userId, input) {
  touch();
  const user = market.findUser(userId);
  const loan = userLoan(user.id);
  if (!loan) fail('You have no locked shares.', 400);
  const propertyId = String(input?.propertyId || '');
  const shares = sharesOf(input?.shares);
  const line = (loan.collateral || []).find((row) => String(row.propertyId) === propertyId);
  if (!line || line.shares < shares) fail('Those shares are not locked.', 400);
  line.shares -= shares;
  if (ltvBps(loan) > MAX_LTV_BPS) {
    line.shares += shares;
    fail('Releasing those shares would push the loan over the 50% loan-to-value limit.', 400);
  }
  if (line.shares <= 0) loan.collateral = loan.collateral.filter((row) => row !== line);
  if (!loan.collateral.length && debtCents(loan) <= 0) {
    store().loans = store().loans.filter((row) => row !== loan);
  }
  persistence.save();
  return snapshot(user.id);
}

function liquidate(userId, loanId) {
  touch();
  const liquidator = market.findUser(userId);
  const loan = store().loans.find((row) => row.id === String(loanId));
  if (!loan) fail('Loan not found.', 404);
  if (String(loan.userId) === String(liquidator.id)) fail('You cannot liquidate your own loan.', 400);
  if (ltvBps(loan) < LIQUIDATION_LTV_BPS) fail('This loan is not at the liquidation threshold.', 400);
  const debt = debtCents(loan);
  if (market.availableCashCents(liquidator) < debt) fail('Not enough USDC to repay this loan.', 400);
  const borrower = market.findUser(loan.userId);
  liquidator.cashCents -= debt;
  store().poolCents += debt;
  let seizeCents = Math.ceil(debt * (10000 + PENALTY_BPS) / 10000);
  for (const line of loan.collateral || []) {
    const mark = market.markCents(line.propertyId);
    if (mark < 1 || line.shares < 1) continue;
    const affordable = Math.min(line.shares, Math.ceil(seizeCents / mark));
    const take = seizeCents > 0 ? Math.max(1, Math.min(line.shares, affordable)) : 0;
    if (take < 1) continue;
    const from = Math.floor(Number(borrower.shareBalances?.[line.propertyId] || 0));
    const moved = Math.min(from, take);
    if (moved < 1) continue;
    borrower.shareBalances[line.propertyId] = from - moved;
    if (borrower.shareBalances[line.propertyId] <= 0) delete borrower.shareBalances[line.propertyId];
    liquidator.shareBalances[line.propertyId] = Math.floor(Number(liquidator.shareBalances?.[line.propertyId] || 0)) + moved;
    seizeCents -= moved * mark;
    line.shares -= moved;
  }
  store().loans = store().loans.filter((row) => row !== loan);
  persistence.save();
  return snapshot(liquidator.id);
}

module.exports = { snapshot, supply, withdraw, borrow, repay, release, liquidate };
