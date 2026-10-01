const kycService = require('../services/kycService');
const sumsub = require('../services/sumsubClient');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('KYC error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function getMine(req, res) {
  try {
    return res.json(kycService.getProfile(req.user.sub));
  } catch (err) {
    return sendError(res, err);
  }
}

function submit(req, res) {
  try {
    return res.json(kycService.submit(req.user.sub, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

function bindWallet(req, res) {
  try {
    return res.json(kycService.bindWallet(req.user.sub, req.body && req.body.address));
  } catch (err) {
    return sendError(res, err);
  }
}

function listInvestors(req, res) {
  try {
    return res.json({ investors: kycService.listInvestors() });
  } catch (err) {
    return sendError(res, err);
  }
}

function review(req, res) {
  try {
    return res.json(kycService.review(req.params.userId, req.body || {}));
  } catch (err) {
    return sendError(res, err);
  }
}

async function sumsubToken(req, res) {
  try {
    if (!sumsub.isConfigured()) {
      return res.status(503).json({ error: 'Sumsub is not configured.' });
    }
    const started = kycService.beginSumsub(req.user.sub, req.body || {});
    const issued = await sumsub.createAccessToken(started.user.id, started.user.email);
    return res.json({ ...started, token: issued.token });
  } catch (err) {
    return sendError(res, err);
  }
}

async function sumsubSync(req, res) {
  try {
    if (!sumsub.isConfigured()) {
      return res.status(503).json({ error: 'Sumsub is not configured.' });
    }
    const userId = req.user.sub;
    let applicant;
    try {
      applicant = await sumsub.getApplicant(userId);
    } catch (err) {
      if (err.status === 404) return res.json(kycService.getProfile(userId));
      throw err;
    }
    const event = sumsub.eventFromApplicant(applicant);
    if (event) {
      event.externalUserId = String(userId);
      kycService.applySumsubEvent(event, sumsub.profileFromApplicant(applicant));
    }
    return res.json(kycService.getProfile(userId));
  } catch (err) {
    return sendError(res, err);
  }
}

async function sumsubWebhook(req, res) {
  try {
    const digest = req.get('x-payload-digest');
    const alg = req.get('x-payload-digest-alg');
    if (!sumsub.verifyWebhook(req.rawBody, digest, alg)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const payload = req.body && typeof req.body === 'object' ? { ...req.body } : {};
    let profile = null;
    if (
      payload.type === 'applicantReviewed'
      && payload.reviewResult
      && payload.reviewResult.reviewAnswer === 'GREEN'
      && payload.externalUserId
    ) {
      try {
        const applicant = await sumsub.getApplicant(payload.externalUserId);
        profile = sumsub.profileFromApplicant(applicant);
        if (!payload.applicantId && applicant && applicant.id) payload.applicantId = applicant.id;
      } catch (err) {
        console.error('Sumsub applicant lookup failed:', err.message);
      }
    }
    kycService.applySumsubEvent(payload, profile);
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = {
  getMine,
  submit,
  bindWallet,
  listInvestors,
  review,
  sumsubToken,
  sumsubSync,
  sumsubWebhook,
};
