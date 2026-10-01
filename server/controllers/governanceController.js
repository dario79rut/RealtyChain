const governanceService = require('../services/governanceService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Governance error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function list(req, res) {
  try {
    return res.json(governanceService.list(req.user.sub, req.query.propertyId));
  } catch (err) {
    return sendError(res, err);
  }
}

function create(req, res) {
  try {
    return res.status(201).json(governanceService.create(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function vote(req, res) {
  try {
    return res.json(governanceService.vote(req.user.sub, req.params.id, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { list, create, vote };
