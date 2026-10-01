const persistence = require('../mock/persistence');
const propertyService = require('./propertyService');
const vault = require('./vaultService');

const STATUSES = new Set(['Available', 'Sold Out', 'Coming Soon']);
const REQUIRED = [
  { kind: 'deed', label: 'Title deed' },
  { kind: 'appraisal', label: 'Appraisal' },
  { kind: 'insurance', label: 'Insurance' },
];

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function ownerAccount(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (user.role !== 'owner') fail('Property owner access required.', 403);
  return user;
}

function ownedProperty(user, id) {
  const property = propertyService.getById(id);
  if (!property || String(property.ownerId) !== String(user.id)) fail('Property not found.', 404);
  return property;
}

function register(userId, input) {
  const user = ownerAccount(userId);
  const property = propertyService.create({ ...(input || {}), status: 'Coming Soon' });
  property.ownerId = user.id;
  property.documentStatus = 'unverified';
  property.projectProgress = 0;
  property.progressLog = [];
  persistence.save();
  return property;
}

function setSaleStatus(userId, id, status) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  if (!STATUSES.has(status)) fail('Choose Available, Coming Soon, or Sold Out.', 400);
  if (status === 'Available' && property.documentStatus === 'unverified') {
    fail('Verify the title deed, appraisal, and insurance before opening the sale.', 400);
  }
  property.status = status;
  persistence.save();
  return property;
}

function addDocument(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const source = input && typeof input === 'object' ? input : {};
  const kind = String(source.kind || '').trim();
  const required = REQUIRED.find((row) => row.kind === kind);
  if (!required) fail('Choose a title deed, appraisal, or insurance file.', 400);
  const data = String(source.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!data) fail('File data is required.', 400);
  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    fail('File data must be base64.', 400);
  }
  const stored = vault.saveUpload(property.id, source.filename || `${kind}.pdf`, buffer);
  stored.name = required.label;
  stored.kind = kind;
  stored.review = 'pending';
  property.documents = [...(property.documents || []).filter((doc) => doc.kind !== kind), stored];
  if (property.documentStatus === 'verified') property.documentStatus = 'unverified';
  persistence.save();
  return property;
}

function verifyDocuments(userId, id) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const missing = REQUIRED.filter((row) => !(property.documents || []).some((doc) => doc.kind === row.kind));
  if (missing.length) {
    fail(`Upload ${missing.map((row) => row.label.toLowerCase()).join(', ')} before verification.`, 400);
  }
  for (const doc of property.documents) {
    if (REQUIRED.some((row) => row.kind === doc.kind)) doc.review = 'verified';
  }
  property.documentStatus = 'verified';
  property.documentsVerifiedAt = new Date().toISOString();
  persistence.save();
  return property;
}

function addProgress(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const source = input && typeof input === 'object' ? input : {};
  const percent = Number(source.percent);
  const note = String(source.note || '').trim();
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) fail('Progress must be a whole number from 0 to 100.', 400);
  if (note.length < 8 || note.length > 400) fail('Describe the update in 8–400 characters.', 400);
  const entry = { at: new Date().toISOString(), percent, note };
  property.projectProgress = percent;
  property.progressLog = [entry, ...(property.progressLog || [])].slice(0, 20);
  persistence.save();
  return property;
}

module.exports = {
  REQUIRED,
  register,
  setSaleStatus,
  addDocument,
  verifyDocuments,
  addProgress,
};
