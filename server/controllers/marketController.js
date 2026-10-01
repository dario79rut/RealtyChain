const marketService = require('../services/marketService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Market error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function snapshot(req, res) {
  try {
    return res.json(marketService.snapshot(req.user.sub));
  } catch (err) {
    return sendError(res, err);
  }
}

function place(req, res) {
  try {
    return res.status(201).json(marketService.place(req.user.sub, req.body || {}));
  } catch (err) {
    if ((err.status || 500) < 500) {
      const persistence = require('../mock/persistence');
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
