let stores = new Map();
let unavailable = false;
let lambdaEvent = null;
let connected = false;
const { usesPostgresStorage, recordStores, createPostgresStore } = require('./postgres');

function usesVercelStorage() {
  if (process.env.STORAGE_PROVIDER) return process.env.STORAGE_PROVIDER === 'vercel';
  return Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function inLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
}

function blobsEnabled() {
  return Boolean(
    usesPostgresStorage() ||
    usesVercelStorage() ||
    lambdaEvent ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    process.env.NETLIFY ||
    inLambda()
  );
}

function skipFsWrites() {
  if (usesVercelStorage()) return true;
  if (process.env.NETLIFY_DEV === 'true' || process.env.NETLIFY_LOCAL === 'true') return false;
  return Boolean(lambdaEvent || inLambda() || (process.env.NETLIFY && process.env.NETLIFY_DEV !== 'true'));
}

// Netlify Functions encode Blobs credentials on the Lambda event. Call this
// at the start of every invocation before getStore() or the write is in-memory
// only and "Allow this IP" will not survive the next request.
function attachLambdaEvent(event) {
  lambdaEvent = event || null;
  connected = false;
  unavailable = false;
  stores.clear();
  if (lambdaEvent && !process.env.NETLIFY) process.env.NETLIFY = 'true';
}

async function loadBlobsModule() {
  require.resolve('@netlify/blobs');
  return import('@netlify/blobs');
}

function credentialsFromEvent(event) {
  const raw = event?.blobs || process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) return {};
  try {
    const decoded =
      typeof raw === 'string'
        ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
        : raw;
    return {
      siteID: decoded.site_id || decoded.siteID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
      token: decoded.token,
      edgeURL: decoded.url || decoded.edgeURL,
    };
  } catch {
    return {
      siteID: process.env.SITE_ID || process.env.NETLIFY_SITE_ID,
    };
  }
}

async function getBlobStore(name, { consistency } = {}) {
  if (usesPostgresStorage() && recordStores.has(name)) return createPostgresStore(name);
  const cacheKey = `${name}:${consistency || 'eventual'}`;
  if (usesVercelStorage()) {
    if (!stores.has(cacheKey)) {
      const { createVercelStore } = require('./vercel');
      stores.set(cacheKey, createVercelStore(name));
    }
    return stores.get(cacheKey);
  }
  if (!blobsEnabled()) return null;
  if (unavailable) return null;
  if (stores.has(cacheKey)) return stores.get(cacheKey);
  try {
    const blobs = await loadBlobsModule();
    if (lambdaEvent && typeof blobs.connectLambda === 'function' && !connected) {
      blobs.connectLambda(lambdaEvent);
      connected = true;
    }
    let store;
    try {
      store = blobs.getStore({ name, consistency });
    } catch (first) {
      const creds = credentialsFromEvent(lambdaEvent);
      if (!creds.siteID || !creds.token) throw first;
      store = blobs.getStore({ name, consistency, siteID: creds.siteID, token: creds.token });
    }
    stores.set(cacheKey, store);
    return store;
  } catch (err) {
    unavailable = true;
    console.error('Netlify Blobs unavailable, falling back to in-memory/file storage:', err.message);
    return null;
  }
}

module.exports = { blobsEnabled, skipFsWrites, getBlobStore, attachLambdaEvent, usesVercelStorage };
