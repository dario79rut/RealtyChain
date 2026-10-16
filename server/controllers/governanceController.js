const governanceService = require('../services/governanceService');
const { readSnapshot } = require('../storage/readSnapshot');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Governance error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

async function list(req, res) {
  try {
    return res.json(await readSnapshot(() => governanceService.list(req.user.sub, req.query.propertyId)));
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

function respond(req, res) {
  try {
    return res.json(governanceService.respond(req.user.sub, req.params.id, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function configureAgreement(req, res) {
  try {
    return res.json(governanceService.configureAgreement(req.user.sub, req.params.propertyId, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { list, create, vote, respond, configureAgreement };
