const fs = require('fs');
const path = require('path');
const { isIP } = require('net');
const { createHash, randomUUID } = require('crypto');
const { getBlobStore, skipFsWrites } = require('../storage/blobs');

const SETTINGS_FILE = path.join(__dirname, '..', 'mock', 'settings.json');
const BLOB_STORE = 'server-settings';
const ACTIVITY_FILE = path.join(__dirname, '..', 'mock', 'login-activity.json');
const ACTIVITY_STORE = 'login-activity';
const strongStore = (name) => getBlobStore(name, { consistency: 'strong' });

const DEFAULT_SETTINGS = {
  allowedAdminIps: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
};

const MAX_LOGIN_ATTEMPTS = 10;

function storageError() {
  return Object.assign(new Error('Login settings storage is unavailable. Check the configured data store.'), { status: 503 });
}

async function load() {
  const store = await strongStore(BLOB_STORE);
  if (store) {
    try {
      const raw = await store.get('settings', { type: 'text', consistency: 'strong' });
      return raw !== null ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (err) {
      console.error('Error reading login settings:', err.message);
      throw storageError();
    }
  }
  if (skipFsWrites()) throw storageError();
  if (fs.existsSync(SETTINGS_FILE)) {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  }
  return { ...DEFAULT_SETTINGS };
}

async function save(settings) {
  const store = await strongStore(BLOB_STORE);
  if (store) {
    await store.set('settings', JSON.stringify(settings));
    return;
  }
  if (skipFsWrites()) throw storageError();
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

// Normalize IPv4-mapped IPv6 and loopback aliases so matching is consistent.
function normalizeIp(ip) {
  if (!ip) return '';
  let value = String(ip).trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1') value = '127.0.0.1';
  if (value.includes('%') || !isIP(value)) return '';
  // Canonicalize equivalent IPv6 spellings before exact allowlist matching.
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
}

function headerValue(req, names) {
  const headers = (req && req.headers) || {};
  for (const name of names) {
    const raw = headers[name] || headers[String(name).toLowerCase()];
    if (raw == null || raw === '') continue;
    return String(Array.isArray(raw) ? raw[0] : raw).trim();
  }
  return '';
}

function getClientIp(req) {
  if (!req) return '';
  const forwarded = headerValue(req, ['x-forwarded-for']);
  const candidates = [
    // On Vercel, use the platform's forwarded address before other proxy headers.
    ...(process.env.VERCEL ? forwarded.split(',').map((part) => part.trim()) : []),
    headerValue(req, ['x-nf-client-connection-ip']),
    headerValue(req, ['client-ip']),
    headerValue(req, ['true-client-ip']),
    headerValue(req, ['cf-connecting-ip']),
    ...(forwarded ? forwarded.split(',').map((part) => part.trim()) : []),
    req.ip,
    req.socket && req.socket.remoteAddress,
  ];
  for (const raw of candidates) {
    const ip = normalizeIp(raw);
    if (ip) return ip;
  }
  return '';
}

function envAllowedIps() {
  const raw = process.env.ALLOWED_LOGIN_IPS || '';
  return [...new Set(raw.split(/[\s,]+/).map(normalizeIp).filter(Boolean))];
}

function storedIps(settings) {
  return [...new Set((settings.allowedAdminIps || []).map(normalizeIp).filter(Boolean))];
}

function effectiveIps(settings) {
  return [...new Set([...envAllowedIps(), ...storedIps(settings)])];
}

function isIpAllowed(ip, settings) {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return effectiveIps(settings).includes(normalized);
}

async function isRequestIpAllowed(req) {
  if (process.env.LOGIN_OPEN === 'true') return true;
  const ip = getClientIp(req);
  if (envAllowedIps().includes(ip)) return true;
  const s = await load();
  return isIpAllowed(ip, s);
}

function recentByIp(rows) {
  const seen = new Set();
  return rows.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).filter((row) => {
    if (seen.has(row.ip)) return false;
    seen.add(row.ip);
    return true;
  }).slice(0, MAX_LOGIN_ATTEMPTS);
}

async function activityRows() {
  const store = await strongStore(ACTIVITY_STORE);
  if (store) {
    const { blobs } = await store.list({ prefix: 'addresses/' });
    const rows = await Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json', consistency: 'strong' })));
    return rows.filter(Boolean);
  }
  if (skipFsWrites()) throw storageError();
  return fs.existsSync(ACTIVITY_FILE) ? JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf8')) : [];
}

async function recordLoginAttempt(req, { email, result }) {
  const entry = {
    id: `${Date.now().toString(36)}-${randomUUID()}`,
    ip: getClientIp(req) || 'unknown',
    email: String(email || '').trim().toLowerCase().slice(0, 160),
    result,
    at: new Date().toISOString(),
  };
  try {
    const store = await strongStore(ACTIVITY_STORE);
    // Separate address/result keys avoid losing another visitor's login when
    // different function instances write at the same time. Keep successes even
    // if the same address later submits an unsuccessful attempt.
    if (store) {
      const address = createHash('sha256').update(entry.ip).digest('hex');
      await store.set(`addresses/${address}/${result}`, JSON.stringify(entry));
    } else {
      if (skipFsWrites()) throw storageError();
      const rows = await activityRows();
      const next = [entry, ...rows.filter((row) => row.ip !== entry.ip || row.result !== result)];
      fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(next, null, 2), 'utf8');
    }
  } catch (err) {
    // A telemetry outage must not turn valid credentials into a failed login.
    console.error('Could not persist login activity:', err.message);
  }
  return entry;
}

async function getSettings(req) {
  const s = await load();
  const currentIp = getClientIp(req);
  const envIps = envAllowedIps();
  let rows = [];
  let loginActivityError;
  try {
    rows = await activityRows();
  } catch (err) {
    console.error('Could not read login activity:', err.message);
    loginActivityError = 'Login activity could not be loaded. Try again shortly.';
  }
  return {
    allowedAdminIps: effectiveIps(s),
    envAllowedIps: envIps,
    currentIp,
    ipAllowed: isIpAllowed(currentIp, s),
    loginAttempts: recentByIp([...rows]),
    recentLogins: recentByIp(rows.filter((row) => row.result === 'signed-in')),
    ...(loginActivityError ? { loginActivityError } : {}),
  };
}

async function setAllowedIps(ips, req) {
  const s = await load();
  return persistAllowedIps(ips, req, s);
}

async function persistAllowedIps(ips, req, s) {
  const fromEnv = new Set(envAllowedIps());
  // Env IPs stay in ALLOWED_LOGIN_IPS (Netlify / .env). Only extra addresses
  // from this form are persisted to blobs or the local settings file.
  const normalized = [...new Set((ips || []).map(normalizeIp).filter(Boolean))].filter(
    (ip) => !fromEnv.has(ip)
  );
  s.allowedAdminIps = normalized;
  await save(s);
  return getSettings(req);
}

async function allowCurrentIp(req) {
  const current = getClientIp(req);
  if (!current) {
    throw Object.assign(new Error('Could not determine the client IP address.'), { status: 400 });
  }
  const s = await load();
  const next = [...storedIps(s), current];
  // Keep the ETag from this read: reloading before the write could hide an
  // intervening change and overwrite an address added by another instance.
  return persistAllowedIps(next, req, s);
}

module.exports = {
  getSettings,
  setAllowedIps,
  allowCurrentIp,
  isRequestIpAllowed,
  getClientIp,
  recordLoginAttempt,
};
