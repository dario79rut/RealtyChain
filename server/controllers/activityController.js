const persistence = require('../mock/persistence');
const activityService = require('../services/activityService');

function currentUser(req) {
  return persistence.data.users.find((u) => String(u.id) === String(req.user?.sub)) || null;
}

function canonicalWallet(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('0x') ? raw.toLowerCase() : raw;
}

function requestedWallet(req) {
  const query = canonicalWallet(req.query.wallet || '');
  const account = currentUser(req);
  if (query) {
    if (account?.role === 'admin') return query;
    if (account?.walletAddress && canonicalWallet(account.walletAddress) === query) return query;
    const err = Object.assign(new Error('Wallet does not match this account.'), { status: 403 });
    throw err;
  }
  if (!account?.walletAddress) {
    throw Object.assign(new Error('Link a wallet before reading activity.'), { status: 400 });
  }
  return canonicalWallet(account.walletAddress);
}

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Activity error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

async function sync(req, res) {
  try {
    return res.json(await activityService.sync());
  } catch (err) {
    return sendError(res, err);
  }
}

function get(req, res) {
  try {
    const wallet = requestedWallet(req);
    return res.json(activityService.forWallet(wallet));
  } catch (err) {
    return sendError(res, err);
  }
}

function tax(req, res) {
  try {
    const wallet = requestedWallet(req);
    const year = req.query.year || new Date().getUTCFullYear();
    return res.json(activityService.taxForWallet(wallet, year));
  } catch (err) {
    return sendError(res, err);
  }
}

function taxCsv(req, res) {
  try {
    const wallet = requestedWallet(req);
    const year = req.query.year || new Date().getUTCFullYear();
    const csv = activityService.taxCsvForWallet(wallet, year);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="realtychain-tax-${year}.csv"`);
    return res.send(csv);
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { sync, get, tax, taxCsv };
