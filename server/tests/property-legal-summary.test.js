const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const persistence = { data: {}, save() {} };
require.cache[require.resolve('../mock/persistence')] = { exports: persistence };
require.cache[require.resolve('../services/imageService')] = { exports: { defaultUrl: () => '/property.jpg' } };
const service = require('../services/propertyService');
const legal = {
  issuerName: 'Harborview Property Holdings LLC', registrationNumber: 'Example registry 123',
  jurisdiction: 'Recorded formation jurisdiction', titleHolder: 'Harborview Property Holdings LLC',
  investorRights: 'Economic rights as described in the agreement.',
  sourceReference: 'Illustrative investment agreement v1, clauses 2–5',
};

beforeEach(() => {
  persistence.data = { properties: [{ id: '1', title: 'Test property', documents: [], governanceAgreement: { spvName: 'Accountable SPV', reference: 'DAO v1' } }] };
});

test('creates and returns a property-specific summary with server-owned update metadata', () => {
  const property = service.create({ title: 'New property', location: 'Test location', price: 100000, totalTokens: 1000,
    legalSummary: { ...legal, issuerName: `  ${legal.issuerName}  `, updatedAt: '1900-01-01', verified: true } });
  assert.equal(property.legalSummary.issuerName, legal.issuerName);
  assert.equal(property.legalSummary.sourceReference, legal.sourceReference);
  assert.ok(Date.parse(property.legalSummary.updatedAt) > Date.parse('2026-01-01'));
  assert.equal(property.legalSummary.verified, undefined);
  assert.deepEqual(service.getById(property.id).legalSummary, property.legalSummary);
});

test('partial updates preserve other legal terms and leave the DAO agreement intact', () => {
  service.update('1', { legalSummary: legal });
  const originalTimestamp = service.getById('1').legalSummary.updatedAt;
  service.update('1', { legalSummary: { issuerName: legal.issuerName } });
  assert.equal(service.getById('1').legalSummary.updatedAt, originalTimestamp);
  const property = service.update('1', { legalSummary: { transferRestrictions: 'Approval required under clause 5.' } });
  assert.equal(property.legalSummary.issuerName, legal.issuerName);
  assert.equal(property.legalSummary.sourceReference, legal.sourceReference);
  assert.equal(property.legalSummary.transferRestrictions, 'Approval required under clause 5.');
  assert.equal(property.governanceAgreement.reference, 'DAO v1');
});

test('a source reference is required and invalid summaries do not mutate the property', () => {
  const before = JSON.stringify(service.getById('1'));
  assert.throws(() => service.update('1', { title: 'Changed', legalSummary: { issuerName: 'Unsupported issuer' } }), /source document reference/);
  assert.equal(JSON.stringify(service.getById('1')), before);
  assert.throws(() => service.create({ title: 'New property', location: 'Test', price: 1, totalTokens: 1,
    legalSummary: { titleHolder: 'Unreferenced holder' } }), /source document reference/);
  assert.equal(persistence.data.properties.length, 1);
});

test('rejects non-object, non-text and oversized legal information', () => {
  for (const value of ['bad', [], 42]) {
    assert.throws(() => service.update('1', { legalSummary: value }), /must be an object/);
  }
  assert.throws(() => service.update('1', { legalSummary: { ...legal, titleHolder: {} } }), /must be text/);
  assert.throws(() => service.update('1', { legalSummary: { ...legal, investorRights: 'x'.repeat(1201) } }), /1,200/);
});

test('allows removal while updates to unrelated fields preserve existing legal information', () => {
  service.update('1', { legalSummary: legal });
  service.update('1', { title: 'Updated property title' });
  assert.equal(service.getById('1').legalSummary.issuerName, legal.issuerName);
  service.update('1', { legalSummary: null });
  assert.equal(service.getById('1').legalSummary, null);
  service.update('1', { legalSummary: {} });
  assert.equal(service.getById('1').legalSummary, null);
});
