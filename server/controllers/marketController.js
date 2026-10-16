const marketService = require('../services/marketService');
const persistence = require('../mock/persistence');
const { usesVercelStorage } = require('../storage/blobs');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Market error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

async function snapshot(req, res) {
  const hosted = usesVercelStorage();
  // Opening Market lazily initializes charts, liquidity and demo balances.
  // Retry that read-time setup against fresh data, never an order submission.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const out = marketService.snapshot(req.user.sub);
      if (hosted) await persistence.commit();
      return res.json(out);
    } catch (err) {
      if (!hosted || err.status !== 409) return sendError(res, err);
      try {
        // Also discard the failed changes on the last attempt, so the response
        // middleware doesn't try to commit that stale snapshot again.
        await persistence.ready({ refresh: true });
      } catch (readError) {
        return sendError(res, readError);
      }
      if (attempt === 3) return sendError(res, err);
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

function place(req, res) {
  try {
    return res.status(201).json(marketService.place(req.user.sub, req.body || {}));
  } catch (err) {
    if ((err.status || 500) < 500) {
      if (!persistence.data.market) persistence.data.market = {};
      if (!Array.isArray(persistence.data.market.failures)) persistence.data.market.failures = [];
      persistence.data.market.failures.unshift({
        at: new Date().toISOString(),
        userId: req.user && req.user.sub,
        propertyId: req.body && req.body.propertyId ? String(req.body.propertyId) : null,
        error: err.message || 'Order rejected',
      });
      persistence.data.market.failures = persistence.data.market.failures.slice(0, 40);
      persistence.save();
    }
    return sendError(res, err);
  }
}

function cancel(req, res) {
  try {
    return res.json(marketService.cancel(req.user.sub, req.params.id));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { snapshot, place, cancel };
