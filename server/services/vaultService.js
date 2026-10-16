const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { skipFsWrites, getBlobStore } = require('../storage/blobs');
const { scheduleWrite } = require('../storage/writes');

const VAULT_ROOT = path.join(__dirname, '..', 'vault');
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'vault');
const SAMPLE_DOCUMENTS_VERSION = 2;
const CATALOG_IDS = new Set(require('../mock/properties').properties.map((property) => String(property.id)));
const MAX_BYTES = 1_500_000;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const BLOB_STORE = 'vault-files';
const KIND_BY_LABEL = [
  [/deed/i, 'deed'],
  [/financ|ppm|projection/i, 'financials'],
  [/inspect|tenant|agreement/i, 'inspection'],
];

const uploadCache = new Map();

function seedKindForName(name) {
  for (const [pattern, kind] of KIND_BY_LABEL) {
    if (pattern.test(name)) return kind;
  }
  return 'financials';
}

function seedDocUrl(propertyId, kind) {
  return `/api/vault/seed/sample-${kind}.pdf`;
}

function rewritePlaceholderDocs(properties) {
  let changed = false;
  for (const property of properties || []) {
    if (!Array.isArray(property.documents)) continue;
    let next = property.documents.map((doc) => {
      const url = String(doc?.url || '').trim();
      if (url && url !== '#') return doc;
      return { name: doc.name, url: seedDocUrl(property.id, seedKindForName(doc.name)) };
    });
    // Migrate catalog links to one shared reference set. Keep uploaded files
    // and preserve removals from the previous sample version.
    const id = String(property.id);
    const kinds = { deed: 'Property Deed', financials: 'Financial Projections', inspection: 'Inspection Report' };
    if (property.sampleDocumentsVersion !== SAMPLE_DOCUMENTS_VERSION && CATALOG_IDS.has(id)
      && Object.keys(kinds).every((kind) => fs.existsSync(path.join(ASSET_DIR, `sample-${kind}.pdf`)))) {
      const seen = new Set();
      next = next.map((doc) => {
        const match = Object.keys(kinds).find((kind) => doc.url === seedDocUrl(id, kind)
          || doc.url === `/api/vault/seed/${id}-${kind}.pdf`);
        return match ? { ...doc, name: kinds[match], url: seedDocUrl(id, match) } : doc;
      }).filter((doc) => {
        if (!Object.keys(kinds).some((kind) => doc.url === seedDocUrl(id, kind))) return true;
        if (seen.has(doc.url)) return false;
        seen.add(doc.url);
        return true;
      });
      if (!property.sampleDocumentsVersion) {
        for (const [kind, name] of Object.entries(kinds)) {
          if (!next.some((doc) => doc.name === name || doc.url === seedDocUrl(id, kind))) {
            next.push({ name, url: seedDocUrl(id, kind) });
          }
        }
      }
      property.sampleDocumentsVersion = SAMPLE_DOCUMENTS_VERSION;
      changed = true;
    }
    if (JSON.stringify(next) !== JSON.stringify(property.documents)) {
      property.documents = next;
      changed = true;
    }
  }
  return changed;
}

function safeName(name) {
  const base = path.basename(String(name || ''));
  if (!NAME_RE.test(base)) return null;
  return base;
}

function seedPath(file) {
  const name = safeName(file);
  if (!name) return null;
  // Older property-specific URLs remain aliases to the same three files.
  const match = name.match(/^[A-Za-z0-9_-]+-(deed|financials|inspection)\.pdf$/i);
  if (!match) return null;
  const full = path.join(ASSET_DIR, `sample-${match[1].toLowerCase()}.pdf`);
  return fs.existsSync(full) ? full : null;
}

function propertyDir(propertyId) {
  const id = String(propertyId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return null;
  return path.join(VAULT_ROOT, id);
}

function propertyFilePath(propertyId, file) {
  const dir = propertyDir(propertyId);
  const name = safeName(file);
  if (!dir || !name) return null;
  const full = path.join(dir, name);
  if (!full.startsWith(dir)) return null;
  return fs.existsSync(full) ? full : null;
}

function blobKey(propertyId, file) {
  return `${propertyId}/${file}`;
}

function persistUpload(propertyId, stored, buffer) {
  const key = blobKey(propertyId, stored);
  const persistBlob = async () => {
    const store = await getBlobStore(BLOB_STORE);
    if (!store) throw new Error('Document storage is unavailable.');
    await store.set(key, buffer);
    uploadCache.set(key, buffer);
  };
  if (skipFsWrites()) {
    scheduleWrite(persistBlob);
    return;
  }
  const dir = propertyDir(propertyId);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, stored), buffer);
    uploadCache.set(key, buffer);
  } catch (err) {
    console.error('Failed to write vault file:', err.message);
    scheduleWrite(persistBlob);
  }
}

function saveUpload(propertyId, filename, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('File is empty.'), { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('File is larger than 1.5 MB.'), { status: 400 });
  }
  const dir = propertyDir(propertyId);
  if (!dir) throw Object.assign(new Error('Invalid property id.'), { status: 400 });
  const ext = path.extname(filename || '').slice(0, 8) || '.bin';
  const stored = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  if (!NAME_RE.test(stored)) {
    throw Object.assign(new Error('Invalid file name.'), { status: 400 });
  }
  persistUpload(propertyId, stored, buffer);
  return {
    name: path.basename(filename || stored).slice(0, 120) || stored,
    url: `/api/vault/${propertyId}/${stored}`,
  };
}

function removeStoredFile(url) {
  const match = String(url || '').match(/^\/api\/vault\/([^/]+)\/([^/]+)$/);
  if (!match || match[1] === 'seed') return;
  const propertyId = match[1];
  const file = match[2];
  const key = blobKey(propertyId, file);
  uploadCache.delete(key);
  const full = propertyFilePath(propertyId, file);
  if (full) {
    try {
      fs.unlinkSync(full);
    } catch {
      // ignore missing files
    }
  }
  scheduleWrite(async () => {
    const store = await getBlobStore(BLOB_STORE);
    if (store) await store.delete(key);
  }, { afterCommit: true });
}

async function readSeed(file) {
  const fromDisk = seedPath(file);
  if (fromDisk) return fs.readFileSync(fromDisk);
  return null;
}

async function readPropertyFile(propertyId, file) {
  const name = safeName(file);
  if (!name) return null;
  const key = blobKey(propertyId, name);
  if (uploadCache.has(key)) return uploadCache.get(key);
  const fromDisk = propertyFilePath(propertyId, name);
  if (fromDisk) return fs.readFileSync(fromDisk);
  const store = await getBlobStore(BLOB_STORE);
  if (store) {
    try {
      const raw = await store.get(key, { type: 'arrayBuffer' });
      if (raw) {
        const buffer = Buffer.from(raw);
        uploadCache.set(key, buffer);
        return buffer;
      }
    } catch (err) {
      console.error('Error reading vault file from Blob storage:', err.message);
    }
  }
  return null;
}

module.exports = {
  VAULT_ROOT,
  rewritePlaceholderDocs,
  seedDocUrl,
  seedPath,
  propertyFilePath,
  saveUpload,
  removeStoredFile,
  readSeed,
  readPropertyFile,
  MAX_BYTES,
};
