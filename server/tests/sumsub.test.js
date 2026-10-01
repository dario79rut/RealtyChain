const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

const app = require('../app');
const sumsub = require('../services/sumsubClient');

const SECRET = 'test-webhook-secret';
const ENV_KEYS = ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET', 'SUMSUB_LEVEL_NAME'];

let server;
let base;
let savedEnv;
let applicants;

function rememberEnv() {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  sumsub.setTransport(null);
}

function enableSumsub() {
  process.env.SUMSUB_APP_TOKEN = 'sbx:test-token';
  process.env.SUMSUB_SECRET_KEY = 'test-secret';
  process.env.SUMSUB_WEBHOOK_SECRET = SECRET;
  process.env.SUMSUB_LEVEL_NAME = 'basic-kyc-level';
}

before(async () => {
  rememberEnv();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  restoreEnv();
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

async function request(path, { method = 'GET', body, token, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function registerInvestor(label) {
  const email = `sumsub-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = 'pass1234';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, username: 'Sumsub User' },
  });
  assert.equal(registered.status, 201);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200);
  return { token: login.data.token, user: login.data.user };
}

function installTransport() {
  applicants = {};
  sumsub.setTransport(async (method, path, bodyString) => {
    if (method === 'POST' && path === '/resources/accessTokens/sdk') {
      const body = JSON.parse(bodyString);
      assert.equal(body.levelName, 'basic-kyc-level');
      return { token: '_act-sbx-test', userId: body.userId };
    }
    if (method === 'GET' && path.includes('/resources/applicants/-;externalUserId=')) {
      const id = decodeURIComponent(path.split('externalUserId=')[1].split('/')[0]);
      const applicant = applicants[id];
      if (!applicant) {
        const err = new Error('Applicant not found');
        err.status = 404;
        throw err;
      }
      return applicant;
    }
    throw new Error(`unexpected Sumsub call ${method} ${path}`);
  });
}

function sign(raw, alg = 'sha256') {
  return crypto.createHmac(alg, SECRET).update(raw).digest('hex');
}

async function postWebhook(payload, { digest, algHeader = 'HMAC_SHA256_HEX' } = {}) {
  const raw = JSON.stringify(payload);
  return request('/api/kyc/sumsub/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'X-Payload-Digest': digest === undefined ? sign(raw) : digest,
      'X-Payload-Digest-Alg': algHeader,
    },
  });
}

test('signs Sumsub requests with timestamp, method, path, and body', () => {
  process.env.SUMSUB_APP_TOKEN = 'app-token';
  process.env.SUMSUB_SECRET_KEY = 'secret';
  try {
    const headers = sumsub.signHeaders('POST', '/resources/accessTokens/sdk', '{"a":1}', '1607551635');
    const expected = crypto
      .createHmac('sha256', 'secret')
      .update('1607551635POST/resources/accessTokens/sdk{"a":1}')
      .digest('hex');
    assert.equal(headers['X-App-Access-Sig'], expected);
    assert.equal(headers['X-App-Access-Ts'], '1607551635');
    assert.equal(headers['X-App-Token'], 'app-token');
  } finally {
    restoreEnv();
  }
});

test('token route reports when Sumsub is not configured', async () => {
  delete process.env.SUMSUB_APP_TOKEN;
  delete process.env.SUMSUB_SECRET_KEY;
  try {
    const investor = await registerInvestor('off');
    const res = await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token: investor.token,
      body: { accredited: true, attested: true },
    });
    assert.equal(res.status, 503);
    const profile = await request('/api/kyc', { token: investor.token });
    assert.equal(profile.data.sumsubConfigured, false);
  } finally {
    restoreEnv();
  }
});

test('Sumsub token, webhook review, and sync', async () => {
  enableSumsub();
  installTransport();
  try {
    const investor = await registerInvestor('flow');
    const { token, user } = investor;

    const skipped = await request('/api/kyc', {
      method: 'POST',
      token,
      body: { legalName: 'Sumsub User', country: 'US', accredited: true, attested: true },
    });
    assert.equal(skipped.status, 409);

    const missing = await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token,
      body: { accredited: false, attested: true },
    });
    assert.equal(missing.status, 400);

    const issued = await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token,
      body: { accredited: true, attested: true },
    });
    assert.equal(issued.status, 200);
    assert.equal(issued.data.token, '_act-sbx-test');
    assert.equal(issued.data.user.kyc.provider, 'sumsub');
    assert.equal(issued.data.user.kycStatus, 'unverified');
    assert.equal(issued.data.user.accredited, true);

    const forged = await postWebhook({
      type: 'applicantReviewed',
      externalUserId: String(user.id),
      reviewResult: { reviewAnswer: 'GREEN' },
    }, { digest: 'deadbeef' });
    assert.equal(forged.status, 401);

    const pending = await postWebhook({
      type: 'applicantPending',
      applicantId: 'app-1',
      externalUserId: String(user.id),
    });
    assert.equal(pending.status, 200);
    const afterPending = await request('/api/kyc', { token });
    assert.equal(afterPending.data.user.kycStatus, 'pending');

    const resumed = await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token,
      body: { accredited: false, attested: false },
    });
    assert.equal(resumed.status, 200);

    applicants[String(user.id)] = {
      id: 'app-1',
      externalUserId: String(user.id),
      info: { firstName: 'Ada', lastName: 'Lovelace', country: 'USA' },
      review: { reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } },
    };
    const approved = await postWebhook({
      type: 'applicantReviewed',
      applicantId: 'app-1',
      externalUserId: String(user.id),
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    assert.equal(approved.status, 200);
    const afterGreen = await request('/api/kyc', { token });
    assert.equal(afterGreen.data.user.kycStatus, 'approved');
    assert.equal(afterGreen.data.user.name, 'Ada Lovelace');
    assert.equal(afterGreen.data.user.kyc.country, 'US');
    assert.equal(afterGreen.data.user.accredited, true);

    const again = await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token,
      body: { accredited: true, attested: true },
    });
    assert.equal(again.status, 409);

    const unknown = await postWebhook({
      type: 'applicantReviewed',
      externalUserId: '999999999',
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.data.ok, true);
  } finally {
    restoreEnv();
  }
});

test('RED and blocked-country reviews reject the investor', async () => {
  enableSumsub();
  installTransport();
  try {
    const rejected = await registerInvestor('red');
    await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token: rejected.token,
      body: { accredited: true, attested: true },
    });
    const red = await postWebhook({
      type: 'applicantReviewed',
      externalUserId: String(rejected.user.id),
      reviewResult: { reviewAnswer: 'RED', rejectLabels: ['FORGERY'] },
    });
    assert.equal(red.status, 200);
    const afterRed = await request('/api/kyc', { token: rejected.token });
    assert.equal(afterRed.data.user.kycStatus, 'rejected');
    assert.equal(afterRed.data.user.accredited, false);
    assert.match(afterRed.data.user.kyc.reviewNote, /FORGERY/);

    const blocked = await registerInvestor('kp');
    await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token: blocked.token,
      body: { accredited: true, attested: true },
    });
    applicants[String(blocked.user.id)] = {
      id: 'app-kp',
      externalUserId: String(blocked.user.id),
      info: { firstName: 'Blocked', lastName: 'Person', country: 'PRK' },
      review: { reviewStatus: 'completed', reviewResult: { reviewAnswer: 'GREEN' } },
    };
    const greenBlocked = await postWebhook({
      type: 'applicantReviewed',
      externalUserId: String(blocked.user.id),
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    assert.equal(greenBlocked.status, 200);
    const afterBlocked = await request('/api/kyc', { token: blocked.token });
    assert.equal(afterBlocked.data.user.kycStatus, 'rejected');
    assert.equal(afterBlocked.data.user.kyc.country, 'KP');
    assert.equal(afterBlocked.data.user.accredited, false);
  } finally {
    restoreEnv();
  }
});

test('sync applies a completed sandbox review', async () => {
  enableSumsub();
  installTransport();
  try {
    const investor = await registerInvestor('sync');
    await request('/api/kyc/sumsub/token', {
      method: 'POST',
      token: investor.token,
      body: { accredited: true, attested: true },
    });
    const waiting = await request('/api/kyc/sumsub/sync', {
      method: 'POST',
      token: investor.token,
    });
    assert.equal(waiting.status, 200);
    assert.equal(waiting.data.user.kycStatus, 'unverified');

    applicants[String(investor.user.id)] = {
      id: 'app-sync',
      externalUserId: String(investor.user.id),
      info: { firstName: 'Grace', lastName: 'Hopper', country: 'USA' },
      review: { reviewStatus: 'pending' },
    };
    const pending = await request('/api/kyc/sumsub/sync', {
      method: 'POST',
      token: investor.token,
    });
    assert.equal(pending.data.user.kycStatus, 'pending');

    applicants[String(investor.user.id)].review = {
      reviewStatus: 'completed',
      reviewResult: { reviewAnswer: 'GREEN' },
    };
    const done = await request('/api/kyc/sumsub/sync', {
      method: 'POST',
      token: investor.token,
    });
    assert.equal(done.status, 200);
    assert.equal(done.data.user.kycStatus, 'approved');
    assert.equal(done.data.user.name, 'Grace Hopper');
    assert.equal(done.data.user.kyc.country, 'US');
  } finally {
    restoreEnv();
  }
});
