const crypto = require('crypto');
const persistence = require('../mock/persistence');

const DEMO_SHARES = { 1: 40, 3: 25, 6: 15 };
const DEMO_CASH_CENTS = 5_000_000;
const MAX_SHARES = 5000;

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function demoOn() {
  return process.env.DEMO_MODE !== 'false';
}

function dollars(cents) {
  return Math.round(cents) / 100;
}

function propertyById(id) {
  return (persistence.data.properties || []).find((row) => String(row.id) === String(id)) || null;
}

function markCents(propertyId) {
  ensureStore();
  const property = propertyById(propertyId);
  if (!property) return 0;
  const id = String(propertyId);
  const series = store().candles?.[id];
  if (Array.isArray(series) && series.length) return Number(series[series.length - 1].c) || midCents(property);
  const trade = (store().trades || []).find((row) => row.propertyId === id);
  if (trade) return Number(trade.priceCents) || midCents(property);
  return store().opens?.[id] || midCents(property);
}

function midCents(property) {
  const base = property.totalTokens > 0 && property.price > 0
    ? property.price / property.totalTokens
    : property.tokenPrice || 1;
  return Math.max(1, Math.round(base * 100));
}

function store() {
  return persistence.data.market;
}

function ensureStore() {
  if (!persistence.data.market || !Array.isArray(persistence.data.market.orders)) {
    const orders = [];
    const opens = {};
    for (const property of persistence.data.properties || []) {
      const id = String(property.id);
      const mid = midCents(property);
      opens[id] = mid;
      const bids = [
        [0.994, 18],
        [0.988, 30],
        [0.98, 46],
      ];
      const asks = [
        [1.006, 14],
        [1.012, 26],
        [1.02, 40],
      ];
      bids.forEach(([mult, shares], index) => {
        orders.push(bookOrder(id, 'bid', Math.round(mid * mult), shares, index));
      });
      asks.forEach(([mult, shares], index) => {
        orders.push(bookOrder(id, 'ask', Math.round(mid * mult), shares, index));
      });
    }
    persistence.data.market = { orders, trades: [], opens };
    persistence.save();
  }
  if (!persistence.data.market.opens) persistence.data.market.opens = {};
  if (!Array.isArray(persistence.data.market.trades)) persistence.data.market.trades = [];
}

function bookOrder(propertyId, side, priceCents, shares, index) {
  return {
    id: `book-${propertyId}-${side}-${index}-${priceCents}`,
    userId: null,
    propertyId: String(propertyId),
    side,
    priceCents,
    remaining: shares,
    status: 'open',
    createdAt: new Date(Date.now() - (index + 1) * 60000).toISOString(),
  };
}

function ensureLiquidity() {
  let changed = false;
  for (const property of persistence.data.properties || []) {
    const id = String(property.id);
    const mid = store().opens[id] || midCents(property);
    if (!store().opens[id]) {
      store().opens[id] = mid;
      changed = true;
    }
    if (!openOrders(id, 'bid').length) {
      store().orders.push(bookOrder(id, 'bid', Math.round(mid * 0.995), 16, Date.now() % 1000));
      store().orders.push(bookOrder(id, 'bid', Math.round(mid * 0.988), 28, (Date.now() % 1000) + 1));
      changed = true;
    }
    if (!openOrders(id, 'ask').length) {
      store().orders.push(bookOrder(id, 'ask', Math.round(mid * 1.005), 12, Date.now() % 1000));
      store().orders.push(bookOrder(id, 'ask', Math.round(mid * 1.014), 24, (Date.now() % 1000) + 1));
      changed = true;
    }
  }
  if (changed) persistence.save();
}

function findUser(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (!user.shareBalances || typeof user.shareBalances !== 'object') user.shareBalances = {};
  let changed = false;
  if (demoOn() && user.role !== 'admin' && !user.governanceSeeded) {
    const held = Object.values(user.shareBalances).some((value) => Number(value) > 0);
    if (!held) Object.assign(user.shareBalances, DEMO_SHARES);
    user.governanceSeeded = true;
    changed = true;
  }
  if (demoOn() && user.cashCents == null) {
    user.cashCents = DEMO_CASH_CENTS;
    changed = true;
  }
  if (user.cashCents == null) user.cashCents = 0;
  if (changed) persistence.save();
  return user;
}

function userById(userId) {
  if (userId == null) return null;
  return persistence.data.users.find((row) => String(row.id) === String(userId)) || null;
}

function sharesOf(user, propertyId) {
  const value = Number(user?.shareBalances?.[String(propertyId)] || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function addShares(user, propertyId, delta) {
  const key = String(propertyId);
  const next = sharesOf(user, key) + delta;
  if (next < 0) fail('Not enough shares.', 400);
  if (next === 0) delete user.shareBalances[key];
  else user.shareBalances[key] = next;
}

function openOrders(propertyId, side) {
  return store().orders.filter(
    (order) => order.status === 'open'
      && order.remaining > 0
      && (!propertyId || order.propertyId === String(propertyId))
      && (!side || order.side === side)
  );
}

function reservedShares(userId, propertyId) {
  return openOrders(propertyId, 'ask')
    .filter((order) => String(order.userId) === String(userId))
    .reduce((sum, order) => sum + order.remaining, 0);
}

function reservedCashCents(userId) {
  return openOrders(null, 'bid')
    .filter((order) => String(order.userId) === String(userId))
    .reduce((sum, order) => sum + order.remaining * order.priceCents, 0);
}

function availableCashCents(user) {
  return Math.max(0, Number(user.cashCents || 0) - reservedCashCents(user.id));
}

function lockedShares(userId, propertyId) {
  const loans = persistence.data.lending?.loans || [];
  return loans
    .filter((loan) => String(loan.userId) === String(userId))
    .flatMap((loan) => loan.collateral || [])
    .filter((row) => String(row.propertyId) === String(propertyId))
    .reduce((sum, row) => sum + (Number(row.shares) || 0), 0);
}

function availableShares(user, propertyId) {
  return Math.max(0, sharesOf(user, propertyId) - reservedShares(user.id, propertyId) - lockedShares(user.id, propertyId));
}

function recordTrade(propertyId, priceCents, shares, buyerId, sellerId, taker) {
  const at = new Date().toISOString();
  store().trades.unshift({
    id: `trd-${crypto.randomBytes(4).toString('hex')}`,
    propertyId: String(propertyId),
    priceCents,
    shares,
    buyerId: buyerId ?? null,
    sellerId: sellerId ?? null,
    taker: taker === 'sell' ? 'sell' : 'buy',
    at,
  });
  store().trades = store().trades.slice(0, 80);
  applyTradeToCandle(propertyId, priceCents, shares, at);
}

function candleSeed(id) {
  let hash = 2166136261;
  for (const char of String(id)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function candleRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function ensureCandles(property) {
  const id = String(property.id);
  if (!store().candles || typeof store().candles !== 'object') store().candles = {};
  const existing = store().candles[id];
  if (Array.isArray(existing) && existing.length >= 30) return existing;
  const mid = store().opens[id] || midCents(property);
  const random = candleRandom(candleSeed(id));
  const days = 60;
  let price = Math.round(mid * (0.93 + random() * 0.03));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const series = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const open = price;
    const drift = Math.round((mid - price) * 0.12);
    const shock = Math.round((random() - 0.48) * mid * 0.018);
    const close = i === 0 ? mid : Math.max(1, open + drift + shock);
    const high = Math.max(open, close) + Math.round(random() * mid * 0.008) + 1;
    const low = Math.max(1, Math.min(open, close) - Math.round(random() * mid * 0.008));
    const at = new Date(today.getTime() - i * 86400000);
    series.push({
      t: at.toISOString().slice(0, 10),
      o: open,
      h: high,
      l: low,
      c: close,
      v: Math.round(6 + random() * 48),
    });
    price = close;
  }
  store().candles[id] = series;
  return series;
}

function applyTradeToCandle(propertyId, priceCents, shares, at) {
  const property = propertyById(propertyId);
  if (!property) return;
  const series = ensureCandles(property);
  const key = dayKey(at || Date.now());
  let bar = series.find((row) => row.t === key);
  if (!bar) {
    const prev = series[series.length - 1];
    bar = {
      t: key,
      o: prev ? prev.c : priceCents,
      h: priceCents,
      l: priceCents,
      c: priceCents,
      v: 0,
    };
    series.push(bar);
    series.sort((a, b) => a.t.localeCompare(b.t));
    if (series.length > 90) series.splice(0, series.length - 90);
  }
  bar.h = Math.max(bar.h, priceCents);
  bar.l = Math.min(bar.l, priceCents);
  bar.c = priceCents;
  bar.v += shares;
}

function syncCandles() {
  if (!store().candles || typeof store().candles !== 'object') store().candles = {};
  const created = [];
  for (const property of persistence.data.properties || []) {
    const id = String(property.id);
    if (!Array.isArray(store().candles[id]) || store().candles[id].length < 30) {
      ensureCandles(property);
      created.push(id);
    }
  }
  if (!created.length) return;
  for (const trade of [...store().trades].reverse()) {
    if (created.includes(String(trade.propertyId))) {
      applyTradeToCandle(trade.propertyId, trade.priceCents, trade.shares, trade.at);
    }
  }
  persistence.save();
}

function publicCandles(propertyId) {
  const property = propertyById(propertyId);
  if (!property) return [];
  return ensureCandles(property).map((bar) => ({
    t: bar.t,
    open: dollars(bar.o),
    high: dollars(bar.h),
    low: dollars(bar.l),
    close: dollars(bar.c),
    volume: bar.v,
  }));
}

function consume(order, shares) {
  order.remaining -= shares;
  if (order.remaining <= 0) {
    order.remaining = 0;
    order.status = 'filled';
  }
}

function applyFill(buyer, seller, propertyId, shares, priceCents, taker) {
  const cost = shares * priceCents;
  if (buyer) {
    if (buyer.cashCents < cost) fail('Not enough cash.', 400);
    buyer.cashCents -= cost;
    addShares(buyer, propertyId, shares);
  }
  if (seller) {
    addShares(seller, propertyId, -shares);
    seller.cashCents = Number(seller.cashCents || 0) + cost;
  }
  recordTrade(propertyId, priceCents, shares, buyer && buyer.id, seller && seller.id, taker);
}

function rememberOrder(user, propertyId, side, priceCents, amount, remaining) {
  store().orders.unshift({
    id: `ord-${crypto.randomBytes(4).toString('hex')}`,
    userId: user.id,
    propertyId,
    side,
    priceCents,
    amount,
    remaining,
    filled: Math.max(0, amount - remaining),
    status: remaining > 0 ? 'open' : 'filled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  store().orders = store().orders.slice(0, 240);
}

function place(userId, input) {
  ensureStore();
  const user = findUser(userId);
  const source = input && typeof input === 'object' ? input : {};
  const propertyId = String(source.propertyId || '').trim();
  const property = propertyById(propertyId);
  if (!property) fail('Property not found.', 404);
  if (user.role === 'admin') fail('Admins do not buy or sell tokens.', 403);
  if (user.suspended) fail('This account is suspended.', 403);
  if (user.restricted) fail('This account is restricted from trading.', 403);
  const platform = property.platform;
  if (platform?.suspended) fail('This property is suspended.', 403);
  if (platform?.tradingPaused) fail('Trading is paused for this property.', 403);
  const side = String(source.side || '');
  if (platform?.transfersRestricted && side === 'ask') fail('Transfers are restricted for this token.', 403);
  if (side !== 'bid' && side !== 'ask') fail('Choose a bid or an ask.', 400);
  const shares = Math.floor(Number(source.shares));
  if (!Number.isFinite(shares) || shares < 1 || shares > MAX_SHARES) {
    fail(`Enter between 1 and ${MAX_SHARES} shares.`, 400);
  }
  const price = Number(source.price);
  if (!Number.isFinite(price) || price <= 0) fail('Enter a price above zero.', 400);
  const priceCents = Math.round(price * 100);
  if (priceCents < 1) fail('Enter a price above zero.', 400);

  if (source.open === true) {
    if (side === 'bid' && shares * priceCents > availableCashCents(user)) fail('Not enough cash for this bid.', 400);
    if (side === 'ask' && shares > availableShares(user, propertyId)) fail('Not enough shares to sell.', 400);
    rememberOrder(user, propertyId, side, priceCents, shares, shares);
    persistence.save();
    ensureLiquidity();
    return snapshot(userId);
  }

  if (side === 'bid') {
    const asks = openOrders(propertyId, 'ask')
      .filter((order) => String(order.userId) !== String(user.id) && order.priceCents <= priceCents)
      .sort((a, b) => a.priceCents - b.priceCents || a.createdAt.localeCompare(b.createdAt));
    let left = shares;
    const takes = [];
    for (const ask of asks) {
      if (left <= 0) break;
      const take = Math.min(left, ask.remaining);
      takes.push({ ask, take });
      left -= take;
    }
    const fillCost = takes.reduce((sum, row) => sum + row.take * row.ask.priceCents, 0);
    const reserve = left * priceCents;
    if (fillCost + reserve > availableCashCents(user)) fail('Not enough cash for this bid.', 400);
    for (const row of takes) {
      const seller = userById(row.ask.userId);
      applyFill(user, seller, propertyId, row.take, row.ask.priceCents, 'buy');
      consume(row.ask, row.take);
    }
    rememberOrder(user, propertyId, 'bid', priceCents, shares, left);
  } else {
    if (shares > availableShares(user, propertyId)) fail('Not enough shares to sell.', 400);
    const bids = openOrders(propertyId, 'bid')
      .filter((order) => String(order.userId) !== String(user.id) && order.priceCents >= priceCents)
      .sort((a, b) => b.priceCents - a.priceCents || a.createdAt.localeCompare(b.createdAt));
    let left = shares;
    const takes = [];
    for (const bid of bids) {
      if (left <= 0) break;
      const take = Math.min(left, bid.remaining);
      takes.push({ bid, take });
      left -= take;
    }
    for (const row of takes) {
      const buyer = userById(row.bid.userId);
      applyFill(buyer, user, propertyId, row.take, row.bid.priceCents, 'sell');
      consume(row.bid, row.take);
    }
    rememberOrder(user, propertyId, 'ask', priceCents, shares, left);
  }

  persistence.save();
  ensureLiquidity();
  return snapshot(userId);
}

function cancel(userId, orderId) {
  ensureStore();
  const user = findUser(userId);
  const order = store().orders.find((row) => row.id === String(orderId));
  if (!order || order.status !== 'open') fail('Order not found.', 404);
  if (String(order.userId) !== String(user.id)) fail('That order is not yours.', 403);
  order.status = 'cancelled';
  order.remaining = 0;
  order.updatedAt = new Date().toISOString();
  persistence.save();
  return snapshot(userId);
}

function levels(propertyId, side) {
  const grouped = new Map();
  const rows = openOrders(propertyId, side).sort((a, b) => (
    side === 'bid' ? b.priceCents - a.priceCents : a.priceCents - b.priceCents
  ));
  for (const order of rows) {
    const current = grouped.get(order.priceCents) || 0;
    grouped.set(order.priceCents, current + order.remaining);
  }
  return [...grouped.entries()].slice(0, 6).map(([priceCents, shares]) => ({
    price: dollars(priceCents),
    shares,
  }));
}

function ensureTape(property) {
  const id = String(property.id);
  if (!store().tape || typeof store().tape !== 'object') store().tape = {};
  if (Array.isArray(store().tape[id]) && store().tape[id].length >= 12) return store().tape[id];
  const series = ensureCandles(property).slice(-8);
  const random = candleRandom(candleSeed(`${id}:tape`));
  const prints = [];
  series.forEach((bar) => {
    const count = 3;
    const start = new Date(`${bar.t}T00:30:00.000Z`).getTime();
    const end = Math.min(new Date(`${bar.t}T23:30:00.000Z`).getTime(), Date.now() - 60_000);
    if (end <= start) return;
    let price = bar.o;
    for (let index = 0; index < count; index += 1) {
      price = Math.round(price + (bar.c - price) * 0.45 + (random() - 0.5) * Math.max(1, bar.h - bar.l));
      price = Math.min(bar.h, Math.max(bar.l, price));
      prints.push({
        id: `tape-${id}-${bar.t}-${index}`,
        propertyId: id,
        priceCents: price,
        shares: Math.max(1, Math.round(1 + random() * 8)),
        taker: random() > 0.48 ? 'buy' : 'sell',
        at: new Date(start + ((index + 1) / (count + 1)) * (end - start)).toISOString(),
      });
    }
  });
  store().tape[id] = prints;
  return prints;
}

function tradeSide(trade) {
  if (trade.taker === 'buy' || trade.taker === 'sell') return trade.taker;
  if (trade.buyerId && !trade.sellerId) return 'buy';
  if (trade.sellerId && !trade.buyerId) return 'sell';
  return 'buy';
}

function snapshot(userId) {
  ensureStore();
  ensureLiquidity();
  syncCandles();
  const user = findUser(userId);
  const titles = new Map((persistence.data.properties || []).map((row) => [String(row.id), row]));
  const quotes = (persistence.data.properties || []).map((property) => {
    const id = String(property.id);
    const bids = openOrders(id, 'bid').sort((a, b) => b.priceCents - a.priceCents);
    const asks = openOrders(id, 'ask').sort((a, b) => a.priceCents - b.priceCents);
    const series = ensureCandles(property);
    const lastBar = series[series.length - 1];
    const prevBar = series[series.length - 2];
    const lastTrade = store().trades.find((trade) => trade.propertyId === id);
    const lastCents = lastBar ? lastBar.c : (lastTrade ? lastTrade.priceCents : (store().opens[id] || midCents(property)));
    const openCents = prevBar ? prevBar.c : (store().opens[id] || lastCents);
    const volume = store().trades
      .filter((trade) => trade.propertyId === id)
      .reduce((sum, trade) => sum + trade.shares, 0);
    const bestBid = bids[0];
    const bestAsk = asks[0];
    return {
      propertyId: id,
      title: property.title,
      location: property.location,
      last: dollars(lastCents),
      change: openCents ? ((lastCents - openCents) / openCents) * 100 : 0,
      bid: bestBid ? dollars(bestBid.priceCents) : null,
      ask: bestAsk ? dollars(bestAsk.priceCents) : null,
      bidSize: bestBid ? bids.filter((order) => order.priceCents === bestBid.priceCents).reduce((sum, order) => sum + order.remaining, 0) : 0,
      askSize: bestAsk ? asks.filter((order) => order.priceCents === bestAsk.priceCents).reduce((sum, order) => sum + order.remaining, 0) : 0,
      volume,
    };
  });
  const books = {};
  for (const property of persistence.data.properties || []) {
    const id = String(property.id);
    books[id] = {
      bids: levels(id, 'bid'),
      asks: [...levels(id, 'ask')].reverse(),
    };
  }
  const positions = [...titles.keys()].map((propertyId) => {
    const shares = sharesOf(user, propertyId);
    const reserved = reservedShares(user.id, propertyId);
    const locked = lockedShares(user.id, propertyId);
    return {
      propertyId,
      title: titles.get(propertyId)?.title || `Property ${propertyId}`,
      shares,
      reserved,
      locked,
      available: Math.max(0, shares - reserved - locked),
    };
  }).filter((row) => row.shares > 0 || row.reserved > 0);
  const ownOrders = store().orders.filter((order) => String(order.userId) === String(user.id) && !String(order.id).startsWith('book-'));
  const presentOrder = (order) => {
    const remaining = Number(order.remaining || 0);
    const filled = order.filled != null
      ? Number(order.filled)
      : Math.max(0, Number(order.amount || remaining) - remaining);
    const amount = Number(order.amount || filled + remaining || 0);
    return {
      id: order.id,
      propertyId: order.propertyId,
      title: titles.get(order.propertyId)?.title || `Property ${order.propertyId}`,
      side: order.side,
      price: dollars(order.priceCents),
      shares: remaining,
      amount,
      filled,
      status: order.status,
      createdAt: order.createdAt,
    };
  };
  const orders = ownOrders.filter((order) => order.status === 'open' && order.remaining > 0).map(presentOrder);
  const orderHistory = ownOrders
    .filter((order) => order.status !== 'open' && Number(order.amount || order.remaining || 0) > 0)
    .slice(0, 30)
    .map(presentOrder);
  let tapeCreated = false;
  const trades = [];
  for (const property of persistence.data.properties || []) {
    const id = String(property.id);
    const hadTape = Array.isArray(store().tape?.[id]) && store().tape[id].length >= 12;
    const tape = ensureTape(property);
    if (!hadTape) tapeCreated = true;
    const real = store().trades.filter((trade) => trade.propertyId === id);
    const rows = [...real, ...tape].map((trade) => ({
      id: trade.id,
      propertyId: id,
      title: titles.get(id)?.title || `Property ${id}`,
      price: dollars(trade.priceCents),
      shares: trade.shares,
      side: tradeSide(trade),
      at: trade.at,
    }));
    rows.sort((a, b) => b.at.localeCompare(a.at));
    trades.push(...rows.slice(0, 24));
  }
  trades.sort((a, b) => b.at.localeCompare(a.at));
  const fills = store().trades
    .filter((trade) => String(trade.buyerId) === String(user.id) || String(trade.sellerId) === String(user.id))
    .slice(0, 40)
    .map((trade) => ({
      id: trade.id,
      propertyId: trade.propertyId,
      title: titles.get(trade.propertyId)?.title || `Property ${trade.propertyId}`,
      price: dollars(trade.priceCents),
      shares: trade.shares,
      side: String(trade.buyerId) === String(user.id) ? 'buy' : 'sell',
      at: trade.at,
    }));
  if (tapeCreated) persistence.save();
  return {
    quotes,
    books,
    orders,
    orderHistory,
    fills,
    trades,
    candles: Object.fromEntries((persistence.data.properties || []).map((property) => [
      String(property.id),
      publicCandles(property.id),
    ])),
    positions,
    cashUsdc: dollars(user.cashCents),
    cashReserved: dollars(reservedCashCents(user.id)),
  };
}

module.exports = { snapshot, place, cancel, findUser, markCents, availableShares, availableCashCents, dollars };
