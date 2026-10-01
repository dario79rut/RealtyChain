const ownerService = require('../services/ownerService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Owner error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function register(req, res) {
  try {
    return res.status(201).json({ property: ownerService.register(req.user.sub, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function update(req, res) {
  try {
    return res.json({ property: ownerService.setSaleStatus(req.user.sub, req.params.id, req.body?.status) });
  } catch (err) {
    return sendError(res, err);
  }
}

function uploadDocument(req, res) {
  try {
    return res.status(201).json({ property: ownerService.addDocument(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function verify(req, res) {
  try {
    return res.json({ property: ownerService.verifyDocuments(req.user.sub, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
}

function progress(req, res) {
  try {
    return res.json({ property: ownerService.addProgress(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function photo(req, res) {
  try {
    return res.status(201).json({ property: ownerService.addPhoto(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function campaign(req, res) {
  try {
    return res.json({ property: ownerService.saveCampaign(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function tokenize(req, res) {
  try {
    return res.json({ property: ownerService.tokenize(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function financeApply(req, res) {
  try {
    return res.json({ property: ownerService.applyFinance(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function financeAccept(req, res) {
  try {
    return res.json({ property: ownerService.acceptFinance(req.user.sub, req.params.id) });
  } catch (err) {
    return sendError(res, err);
  }
}

function financeRepay(req, res) {
  try {
    return res.json({ property: ownerService.repayFinance(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

function pledge(req, res) {
  try {
    return res.json({ property: ownerService.pledge(req.user.sub, req.params.id, req.body || {}) });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  register,
  update,
  uploadDocument,
  verify,
  progress,
  photo,
  campaign,
  tokenize,
  financeApply,
  financeAccept,
  financeRepay,
  pledge,
};
