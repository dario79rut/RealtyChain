const crypto = require('crypto');
const persistence = require('../mock/persistence');
const market = require('./marketService');
const kyc = require('./kycService');

const STAGES = ['draft', 'review', 'approved', 'tokenized', 'funded', 'active'];

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function sharePrice(property) {
  if (Number(property.sharePriceUsdc) > 0) return Number(property.sharePriceUsdc);
  if (Number(property.totalTokens) > 0 && Number(property.price) > 0) return Number(property.price) / Number(property.totalTokens);
  return Number(property.tokenPrice) || 0;
}

function ensurePlatform(property) {
  if (property.platform && STAGES.includes(property.platform.stage)) return false;
  let stage = 'approved';
  if (property.status === 'Coming Soon') stage = 'review';
  if (Number(property.tokensSold) > 0) stage = 'active';
  property.platform = {
    stage,
    suspended: false,
    sale: null,
    valuationUsd: Number(property.price) || 0,
    ownershipVerified: property.documentStatus === 'verified',
    tradingPaused: false,
    feeBps: 100,
    transfersRestricted: false,
    managementFeeBps: 700,
    token: {
      totalSupply: Number(property.totalTokens) || 0,
      price: sharePrice(property),
      ownerPercent: 30,
      minted: Number(property.totalTokens) || 0,
      burned: 0,
      contract: property.tokenAddress || null,
    },
  };
  return true;
}

function audit(adminId, action, target, detail) {
  if (!Array.isArray(persistence.data.audit)) persistence.data.audit = [];
  persistence.data.audit.unshift({
    id: `audit-${crypto.randomBytes(3).toString('hex')}`,
    at: new Date().toISOString(),
    adminId,
    action,
    target: target == null ? null : String(target),
    detail: String(detail || '').slice(0, 240),
  });
  persistence.data.audit = persistence.data.audit.slice(0, 80);
}

function propertyById(id) {
  const property = (persistence.data.properties || []).find((row) => String(row.id) === String(id));
  if (!property) fail('Property not found.', 404);
  ensurePlatform(property);
  return property;
}

function accountById(id) {
  const user = persistence.data.users.find((row) => String(row.id) === String(id));
  if (!user || user.role === 'admin') fail('Account not found.', 404);
  return user;
}

function flowOf(property) {
  const occupancy = property.occupancyPercent == null ? 1 : Math.min(1, Math.max(0, Number(property.occupancyPercent) / 100));
  const cap = property.capRate && property.price ? (Number(property.capRate) / 100) * Number(property.price) / 12 : 0;
  const gross = property.grossRentMonthly == null || Number(property.grossRentMonthly) <= 0 ? cap : Number(property.grossRentMonthly);
  const rent = money(gross * occupancy);
  const expenses = money((Number(property.opexMonthly) || 0) + (Number(property.reservesMonthly) || 0));
  const feeBps = Number(property.platform?.managementFeeBps) || 700;
  const fee = money(rent * feeBps / 10000);
  const net = money(Math.max(0, rent - expenses - fee));
  const ownerPercent = Number(property.platform?.token?.ownerPercent);
  const ownerShare = ownerPercent > 0 ? ownerPercent / 100 : 0.3;
  return {
    rent,
    expenses,
    fee,
    net,
    investor: money(net * (1 - ownerShare)),
    owner: money(net * ownerShare),
    ownerPercent: Math.round(ownerShare * 100),
  };
}

function holdingsOf(user) {
  return Object.entries(user.shareBalances || {})
    .map(([propertyId, shares]) => ({
      propertyId: String(propertyId),
      title: ((persistence.data.properties || []).find((row) => String(row.id) === String(propertyId)) || {}).title || `Property ${propertyId}`,
      shares: Math.floor(Number(shares) || 0),
      value: money(Math.floor(Number(shares) || 0) * market.dollars(market.markCents(propertyId))),
    }))
    .filter((row) => row.shares > 0);
}

function presentAccount(user) {
  const owned = (persistence.data.properties || [])
    .filter((property) => String(property.ownerId) === String(user.id))
    .map((property) => ({ id: String(property.id), title: property.title, stage: property.platform?.stage || null }));
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    role: user.role || 'user',
    kycStatus: user.kycStatus || 'unverified',
    accredited: Boolean(user.accredited),
    country: user.kyc?.country || null,
    walletAddress: user.walletAddress || null,
    suspended: Boolean(user.suspended),
    restricted: Boolean(user.restricted),
    suspicious: Boolean(user.suspicious),
    screenedAt: user.screenedAt || null,
    cashUsdc: money((Number(user.cashCents) || 0) / 100),
    holdings: holdingsOf(user),
    properties: owned,
  };
}

function presentProperty(property) {
  ensurePlatform(property);
  const platform = property.platform;
  const docs = property.documents || [];
  return {
    id: String(property.id),
    title: property.title,
    imageUrl: property.imageUrl || '',
    location: property.location,
    description: property.description || '',
    status: property.status,
    ownerId: property.ownerId || null,
    ownerName: (persistence.data.users.find((user) => String(user.id) === String(property.ownerId)) || {}).name
      || (persistence.data.users.find((user) => String(user.id) === String(property.ownerId)) || {}).email
      || null,
    price: Number(property.price) || 0,
    tokensSold: Number(property.tokensSold) || 0,
    totalTokens: Number(property.totalTokens) || 0,
    documentStatus: property.documentStatus || 'unverified',
    documents: docs.map((doc) => ({ name: doc.name, kind: doc.kind || null, review: doc.review || null })),
    stage: platform.stage,
    suspended: Boolean(platform.suspended),
    sale: platform.sale || null,
    valuationUsd: Number(platform.valuationUsd) || 0,
    ownershipVerified: Boolean(platform.ownershipVerified),
    tradingPaused: Boolean(platform.tradingPaused),
    transfersRestricted: Boolean(platform.transfersRestricted),
    feeBps: Number(platform.feeBps) || 0,
    token: platform.token,
    flow: flowOf(property),
  };
}

function loansView() {
  const book = persistence.data.lending;
  if (!book || !Array.isArray(book.loans)) return [];
  return book.loans.map((loan) => {
    const collateralCents = (loan.collateral || []).reduce(
      (sum, line) => sum + (Number(line.shares) || 0) * market.markCents(line.propertyId),
      0,
    );
    const debtCents = (Number(loan.principalCents) || 0) + (Number(loan.accruedCents) || 0);
    const ltv = collateralCents > 0 ? debtCents / collateralCents : debtCents > 0 ? 1 : 0;
    const user = persistence.data.users.find((row) => String(row.id) === String(loan.userId));
    return {
      id: loan.id,
      borrower: (user && (user.name || user.email)) || 'Account',
      debt: money(debtCents / 100),
      interest: money((Number(loan.accruedCents) || 0) / 100),
      collateral: money(collateralCents / 100),
      ltv,
      health: ltv >= 0.65 ? 'liquidatable' : ltv >= 0.5 ? 'margin' : 'healthy',
      collateralLines: (loan.collateral || []).map((line) => ({
        propertyId: String(line.propertyId),
        shares: line.shares,
      })),
    };
  });
}

function accountStamp(user) {
  return user.createdAt || user.kyc?.reviewedAt || user.kyc?.submittedAt || null;
}

function runningCount(users, days, include) {
  const dated = [];
  let base = 0;
  for (const user of users) {
    if (!include(user)) continue;
    const stamp = accountStamp(user);
    if (!stamp) base += 1;
    else dated.push(String(stamp).slice(0, 10));
  }
  dated.sort();
  let index = 0;
  let running = base;
  return days.map((day) => {
    while (index < dated.length && dated[index] <= day) {
      running += 1;
      index += 1;
    }
    return { t: day, value: running };
  });
}

function growthOf(properties, users) {
  const candles = (persistence.data.market && persistence.data.market.candles) || {};
  const books = properties
    .map((property) => ({
      supply: Number(property.totalTokens) || 0,
      sold: Number(property.tokensSold) || 0,
      bars: Array.isArray(candles[String(property.id)]) ? candles[String(property.id)] : [],
    }))
    .filter((book) => book.bars.length > 0);
  if (!books.length) {
    return { asset: [], sold: [], volume: [], capacity: [], accrued: [], investors: [], owners: [], approved: [] };
  }
  const shared = new Set(books[0].bars.map((bar) => bar.t));
  for (const book of books.slice(1)) {
    const own = new Set(book.bars.map((bar) => bar.t));
    for (const day of shared) {
      if (!own.has(day)) shared.delete(day);
    }
  }
  const days = [...shared].sort();
  const lookups = books.map((book) => new Map(book.bars.map((bar) => [bar.t, bar])));
  const asset = [];
  const sold = [];
  const volume = [];
  const capacity = [];
  for (const day of days) {
    let marked = 0;
    let soldValue = 0;
    let traded = 0;
    books.forEach((book, index) => {
      const bar = lookups[index].get(day);
      const close = (Number(bar.c) || 0) / 100;
      marked += close * book.supply;
      soldValue += close * book.sold;
      traded += close * (Number(bar.v) || 0);
    });
    asset.push({ t: day, value: money(marked) });
    sold.push({ t: day, value: money(soldValue) });
    volume.push({ t: day, value: money(traded) });
    capacity.push({ t: day, value: money(marked * 0.5) });
  }
  const monthlyNet = properties.reduce((total, property) => total + flowOf(property).net, 0);
  const accrued = days.map((day, index) => ({ t: day, value: money((monthlyNet * (index + 1)) / 30) }));
  const investors = users.filter((user) => user.role !== 'owner' && user.role !== 'institution');
  const owners = users.filter((user) => user.role === 'owner');
  return {
    asset,
    sold,
    volume,
    capacity,
    accrued,
    investors: runningCount(investors, days, () => true),
    owners: runningCount(owners, days, () => true),
    approved: runningCount(users, days, (user) => user.kycStatus === 'approved' && user.role !== 'institution'),
  };
}

function snapshot() {
  let changed = false;
  for (const property of persistence.data.properties || []) {
    if (ensurePlatform(property)) changed = true;
  }
  if (changed) persistence.save();
  const marketBook = persistence.data.market || {};
  const orders = (marketBook.orders || [])
    .filter((order) => order.status === 'open' && order.remaining > 0 && !String(order.id).startsWith('book-'))
    .slice(0, 40)
    .map((order) => ({
      id: order.id,
      propertyId: String(order.propertyId),
      side: order.side,
      price: money((Number(order.priceCents) || 0) / 100),
      shares: order.remaining,
      status: order.status,
    }));
  const trades = (marketBook.trades || []).slice(0, 30).map((trade) => ({
    id: trade.id,
    propertyId: String(trade.propertyId),
    price: money((Number(trade.priceCents) || 0) / 100),
    shares: trade.shares,
    at: trade.at,
  }));
  const volume = (marketBook.trades || []).reduce(
    (sum, trade) => sum + ((Number(trade.priceCents) || 0) / 100) * (Number(trade.shares) || 0),
    0,
  );
  const users = persistence.data.users.filter((user) => user.role !== 'admin');
  return {
    properties: (persistence.data.properties || []).map(presentProperty),
    owners: users.filter((user) => user.role === 'owner').map(presentAccount),
    investors: users.filter((user) => user.role !== 'owner' && user.role !== 'institution').map(presentAccount),
    market: {
      orders,
      trades,
      volume: money(volume),
      failures: (marketBook.failures || []).slice(0, 20),
    },
    lending: {
      maxLtv: 0.5,
      liquidationLtv: 0.65,
      borrowApr: 0.08,
      supplyApr: 0.04,
      poolUsdc: money(((persistence.data.lending && persistence.data.lending.poolCents) || 0) / 100),
      loans: loansView(),
    },
    distributions: (persistence.data.distributions || []).slice(0, 20),
    audit: (persistence.data.audit || []).slice(0, 30),
    growth: growthOf(persistence.data.properties || [], users),
  };
}

function act(adminId, input) {
  const source = input && typeof input === 'object' ? input : {};
  const type = String(source.type || '');
  if (type === 'property-stage') {
    const property = propertyById(source.id);
    if (!STAGES.includes(source.stage)) fail('Choose a valid property stage.', 400);
    property.platform.stage = source.stage;
    audit(adminId, 'property-stage', property.id, source.stage);
  } else if (type === 'property-review') {
    const property = propertyById(source.id);
    if (source.decision === 'approved') property.platform.stage = 'approved';
    else if (source.decision === 'rejected') property.platform.stage = 'draft';
    else fail('Approve or reject the property.', 400);
    audit(adminId, 'property-review', property.id, source.decision);
  } else if (type === 'property-verify') {
    const property = propertyById(source.id);
    property.platform.ownershipVerified = true;
    property.documentStatus = 'verified';
    audit(adminId, 'property-verify', property.id, 'Ownership documents verified');
  } else if (type === 'property-valuation') {
    const property = propertyById(source.id);
    const usd = Number(source.usd);
    if (!Number.isFinite(usd) || usd < 1) fail('Enter a valuation above zero.', 400);
    property.platform.valuationUsd = money(usd);
    audit(adminId, 'property-valuation', property.id, `$${money(usd)}`);
  } else if (type === 'property-edit') {
    const property = propertyById(source.id);
    const title = String(source.title || '').trim();
    const location = String(source.location || '').trim();
    if (title.length < 3) fail('Title is required.', 400);
    if (location.length < 2) fail('Location is required.', 400);
    property.title = title.slice(0, 160);
    property.location = location.slice(0, 160);
    property.description = String(source.description || '').slice(0, 4000);
    audit(adminId, 'property-edit', property.id, property.title);
  } else if (type === 'property-suspend') {
    const property = propertyById(source.id);
    property.platform.suspended = Boolean(source.suspended);
    if (property.platform.suspended) property.platform.tradingPaused = true;
    audit(adminId, 'property-suspend', property.id, property.platform.suspended ? 'suspended' : 'restored');
  } else if (type === 'property-sale') {
    const property = propertyById(source.id);
    property.platform.sale = source.sale === 'initiated' ? 'initiated' : null;
    audit(adminId, 'property-sale', property.id, property.platform.sale || 'cleared');
  } else if (type === 'token-set') {
    const property = propertyById(source.id);
    const supply = Math.floor(Number(source.totalSupply));
    const price = Number(source.price);
    const ownerPercent = Math.floor(Number(source.ownerPercent));
    if (!Number.isFinite(supply) || supply < 1) fail('Total supply must be at least 1.', 400);
    if (!Number.isFinite(price) || price <= 0) fail('Set an initial token price.', 400);
    if (!Number.isFinite(ownerPercent) || ownerPercent < 0 || ownerPercent > 90) fail('Owner percentage must be 0–90.', 400);
    if (supply < Number(property.tokensSold || 0)) fail('Supply cannot be below shares already sold.', 400);
    property.totalTokens = supply;
    property.sharePriceUsdc = money(price);
    property.tokenPrice = money(price);
    property.price = money(price * supply);
    property.platform.token.totalSupply = supply;
    property.platform.token.price = money(price);
    property.platform.token.ownerPercent = ownerPercent;
    property.platform.token.minted = supply;
    if (['draft', 'review', 'approved'].includes(property.platform.stage)) property.platform.stage = 'tokenized';
    audit(adminId, 'token-set', property.id, `${supply} @ $${money(price)}`);
  } else if (type === 'token-mint' || type === 'token-burn') {
    const property = propertyById(source.id);
    const shares = Math.floor(Number(source.shares));
    if (!Number.isFinite(shares) || shares < 1) fail('Enter a share count.', 400);
    if (type === 'token-burn' && property.totalTokens - shares < Number(property.tokensSold || 0)) {
      fail('Cannot burn shares that are already sold.', 400);
    }
    if (type === 'token-mint') {
      property.totalTokens += shares;
      property.platform.token.minted += shares;
    } else {
      property.totalTokens -= shares;
      property.platform.token.burned += shares;
    }
    property.platform.token.totalSupply = property.totalTokens;
    property.price = money(sharePrice(property) * property.totalTokens);
    audit(adminId, type, property.id, String(shares));
  } else if (type === 'token-pause') {
    const property = propertyById(source.id);
    property.platform.tradingPaused = Boolean(source.paused);
    audit(adminId, 'token-pause', property.id, property.platform.tradingPaused ? 'paused' : 'open');
  } else if (type === 'token-restrict') {
    const property = propertyById(source.id);
    property.platform.transfersRestricted = Boolean(source.restricted);
    audit(adminId, 'token-restrict', property.id, property.platform.transfersRestricted ? 'restricted' : 'open');
  } else if (type === 'market-fee') {
    const property = propertyById(source.id);
    const feeBps = Math.floor(Number(source.feeBps));
    if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000) fail('Fee must be 0–1000 bps.', 400);
    property.platform.feeBps = feeBps;
    audit(adminId, 'market-fee', property.id, `${feeBps} bps`);
  } else if (type === 'account-kyc') {
    kyc.review(source.id, { decision: source.decision, note: source.note });
    audit(adminId, 'account-kyc', source.id, source.decision);
  } else if (type === 'account-suspend') {
    const user = accountById(source.id);
    user.suspended = Boolean(source.suspended);
    audit(adminId, 'account-suspend', user.id, user.suspended ? 'suspended' : 'restored');
  } else if (type === 'account-flag') {
    const user = accountById(source.id);
    user.suspicious = Boolean(source.suspicious);
    user.restricted = Boolean(source.restricted);
    audit(adminId, 'account-flag', user.id, `${user.suspicious ? 'suspicious' : 'clear'} / ${user.restricted ? 'restricted' : 'open'}`);
  } else if (type === 'account-screen') {
    const user = accountById(source.id);
    user.screenedAt = new Date().toISOString();
    audit(adminId, 'account-screen', user.id, 'AML and sanctions marked screened');
  } else if (type === 'distribution-run') {
    const property = propertyById(source.id);
    const flow = flowOf(property);
    if (!Array.isArray(persistence.data.distributions)) persistence.data.distributions = [];
    persistence.data.distributions.unshift({
      id: `dist-${crypto.randomBytes(3).toString('hex')}`,
      propertyId: String(property.id),
      title: property.title,
      at: new Date().toISOString(),
      ...flow,
      status: 'posted',
    });
    persistence.data.distributions = persistence.data.distributions.slice(0, 40);
    if (property.platform.stage === 'tokenized' || property.platform.stage === 'funded') property.platform.stage = 'active';
    audit(adminId, 'distribution-run', property.id, `Net $${flow.net}`);
  } else {
    fail('Unknown admin action.', 400);
  }
  persistence.save();
  return snapshot();
}

module.exports = { snapshot, act, STAGES };
