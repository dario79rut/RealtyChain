const admin = require('../services/adminService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Admin error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function snapshot(req, res) {
  try {
    return res.json(admin.snapshot());
  } catch (err) {
    return sendError(res, err);
  }
}

function action(req, res) {
  try {
    return res.json(admin.act(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { snapshot, action };
