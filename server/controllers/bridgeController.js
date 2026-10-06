const bridge = require('../services/bridgeService');

function send(res, work) {
  try {
    return res.json(work());
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Request failed' });
  }
}

function desk(req, res) {
  return send(res, () => bridge.desk(req.user));
}

function createPosition(req, res) {
  return send(res, () => ({ position: bridge.createPosition(req.user, req.body) }));
}

function settle(req, res) {
  return send(res, () => bridge.settle(req.user, req.params.linearId));
}

function publicTape(_req, res) {
  return send(res, () => bridge.publicTape());
}

module.exports = { desk, createPosition, settle, publicTape };
