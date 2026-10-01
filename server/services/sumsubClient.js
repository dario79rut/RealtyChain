const crypto = require('crypto');

const BASE_URL = 'https://api.sumsub.com';

const ALPHA3_TO_2 = {
  USA: 'US',
  GBR: 'GB',
  CAN: 'CA',
  AUS: 'AU',
  DEU: 'DE',
  FRA: 'FR',
  ESP: 'ES',
  ITA: 'IT',
  NLD: 'NL',
  CHE: 'CH',
  IRL: 'IE',
  SGP: 'SG',
  JPN: 'JP',
  KOR: 'KR',
  IND: 'IN',
  BRA: 'BR',
  MEX: 'MX',
  NZL: 'NZ',
  SWE: 'SE',
  NOR: 'NO',
  DNK: 'DK',
  FIN: 'FI',
  AUT: 'AT',
  BEL: 'BE',
  PRT: 'PT',
  POL: 'PL',
  ARE: 'AE',
  HKG: 'HK',
  PRK: 'KP',
  IRN: 'IR',
  SYR: 'SY',
  CUB: 'CU',
};

const DIGEST_ALGS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

let transportOverride = null;

function isConfigured() {
  return Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
}

function signHeaders(method, path, bodyString, ts = Math.floor(Date.now() / 1000).toString()) {
  const payload = `${ts}${method.toUpperCase()}${path}${bodyString || ''}`;
  const signature = crypto
    .createHmac('sha256', process.env.SUMSUB_SECRET_KEY)
    .update(payload)
    .digest('hex');
  return {
    'X-App-Token': process.env.SUMSUB_APP_TOKEN,
    'X-App-Access-Ts': ts,
    'X-App-Access-Sig': signature,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function defaultTransport(method, path, bodyString) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: signHeaders(method, path, bodyString),
    body: bodyString || undefined,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { description: text.slice(0, 300) };
    }
  }
  if (!res.ok) {
    const description = data.description || data.errorName || data.message || `Sumsub request failed (${res.status})`;
    const err = new Error(String(description).slice(0, 300));
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return data;
}

async function request(method, path, bodyObj) {
  const bodyString = bodyObj == null ? '' : JSON.stringify(bodyObj);
  const send = transportOverride || defaultTransport;
  return send(method, path, bodyString);
}

function setTransport(fn) {
  transportOverride = fn || null;
}

async function createAccessToken(externalUserId, email) {
  const body = {
    userId: String(externalUserId),
    levelName: process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level',
    ttlInSecs: 600,
  };
  if (email) body.applicantIdentifiers = { email };
  const data = await request('POST', '/resources/accessTokens/sdk', body);
  if (!data || !data.token) {
    throw Object.assign(new Error('Sumsub did not return an access token.'), { status: 502 });
  }
  return data;
}

async function getApplicant(externalUserId) {
  const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(String(externalUserId))}/one`;
  return request('GET', path, null);
}

function verifyWebhook(rawBody, digestHeader, algHeader) {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret || rawBody == null || rawBody === '' || !digestHeader) return false;
  const alg = DIGEST_ALGS[String(algHeader || 'HMAC_SHA256_HEX').trim().toUpperCase()];
  if (!alg) return false;
  const expected = crypto.createHmac(alg, secret).update(rawBody).digest('hex');
  const actual = String(digestHeader).trim().toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function alpha2(code) {
  const raw = String(code || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return ALPHA3_TO_2[raw] || null;
}

function profileFromApplicant(applicant) {
  const info = (applicant && (applicant.info || applicant.fixedInfo)) || {};
  const legalName = [info.firstNameEn || info.firstName, info.lastNameEn || info.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    legalName: legalName || null,
    country: alpha2(info.country),
  };
}

function eventFromApplicant(applicant) {
  if (!applicant) return null;
  const review = applicant.review || {};
  const base = {
    externalUserId: applicant.externalUserId,
    applicantId: applicant.id,
  };
  if (review.reviewStatus === 'completed' && review.reviewResult) {
    return { ...base, type: 'applicantReviewed', reviewResult: review.reviewResult };
  }
  if (review.reviewStatus === 'onHold') {
    return { ...base, type: 'applicantOnHold' };
  }
  if (review.reviewStatus === 'pending' || review.reviewStatus === 'queued' || review.reviewStatus === 'prechecked') {
    return { ...base, type: 'applicantPending' };
  }
  return null;
}

module.exports = {
  isConfigured,
  signHeaders,
  setTransport,
  createAccessToken,
  getApplicant,
  verifyWebhook,
  profileFromApplicant,
  eventFromApplicant,
};
