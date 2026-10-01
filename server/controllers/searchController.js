const searchService = require('../services/searchService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Saved search error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function list(req, res) {
  try {
    return res.json({ searches: searchService.list(req.user.sub) });
  } catch (err) {
    return sendError(res, err);
  }
}

function create(req, res) {
  try {
    return res.status(201).json(searchService.create(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function remove(req, res) {
  try {
    return res.json(searchService.remove(req.user.sub, req.params.id));
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { list, create, remove };
