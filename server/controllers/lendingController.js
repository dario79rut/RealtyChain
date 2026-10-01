const lending = require('../services/lendingService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Lending error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function snapshot(req, res) {
  try {
    return res.json(lending.snapshot(req.user.sub));
  } catch (err) {
    return sendError(res, err);
  }
}

function supply(req, res) {
  try {
    return res.json(lending.supply(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function withdraw(req, res) {
  try {
    return res.json(lending.withdraw(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function borrow(req, res) {
  try {
    return res.status(201).json(lending.borrow(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function repay(req, res) {
  try {
    return res.json(lending.repay(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function release(req, res) {
  try {
    return res.json(lending.release(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function liquidate(req, res) {
  try {
    return res.json(lending.liquidate(req.user.sub, req.params.id));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { snapshot, supply, withdraw, borrow, repay, release, liquidate };
