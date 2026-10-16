const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vault = require('../services/vaultService');
const { properties } = require('../mock/properties');

test('all catalog URLs resolve to the same three bundled two-page reference samples', async () => {
  assert.equal(fs.readdirSync(path.join(__dirname, '..', 'assets', 'vault')).filter((file) => file.endsWith('.pdf')).length, 3);
  for (const property of properties) {
    for (const kind of ['deed', 'financials', 'inspection']) {
      const name = `${property.id}-${kind}.pdf`;
      const expected = path.join(__dirname, '..', 'assets', 'vault', `sample-${kind}.pdf`);
      assert.equal(vault.seedPath(name), expected);
      assert.equal(vault.seedDocUrl(property.id, kind), `/api/vault/seed/sample-${kind}.pdf`);
      assert.ok((await vault.readSeed(`sample-${kind}.pdf`)).equals(fs.readFileSync(expected)));
      const bytes = await vault.readSeed(name);
      assert.ok(bytes.equals(fs.readFileSync(expected)), name);
      assert.match(bytes.subarray(0, 8).toString(), /^%PDF-/);
      assert.match(bytes.toString('latin1'), /\/Count 2\b/);
      assert.ok(bytes.length < vault.MAX_BYTES);
    }
  }
});

test('upgrading property-specific samples preserves previously removed documents', () => {
  const property = { id: '2', sampleDocumentsVersion: 1, documents: [
    { name: 'Property Deed', url: '/api/vault/seed/2-deed.pdf' },
    { name: 'Financial Projections', url: '/api/vault/seed/2-financials.pdf' },
  ] };
  assert.equal(vault.rewritePlaceholderDocs([property]), true);
  assert.equal(property.documents.length, 2);
  assert.deepEqual(property.documents.map((doc) => doc.url), ['/api/vault/seed/sample-deed.pdf', '/api/vault/seed/sample-financials.pdf']);
  assert.equal(vault.rewritePlaceholderDocs([property]), false);
});

test('legacy catalog document labels are corrected and missing samples are added once', () => {
  const property = {
    id: '6', documents: [
      { name: 'Property Deed', url: '/api/vault/seed/6-deed.pdf' },
      { name: 'Historic Designation', url: '/api/vault/seed/6-financials.pdf' },
      { name: 'Renovation Permits', url: '/api/vault/seed/6-financials.pdf' },
      { name: 'Insurance', url: '/api/vault/6/uploaded-insurance.pdf' },
    ],
  };
  assert.equal(vault.rewritePlaceholderDocs([property]), true);
  assert.deepEqual(property.documents.map((doc) => doc.name), ['Property Deed', 'Financial Projections', 'Insurance', 'Inspection Report']);
  assert.equal(vault.rewritePlaceholderDocs([property]), false);
  property.documents = property.documents.filter((doc) => doc.name !== 'Inspection Report');
  assert.equal(vault.rewritePlaceholderDocs([property]), false);
  assert.equal(property.documents.length, 3);
});

test('uploaded documents are preserved and do not receive duplicate sample entries', () => {
  const uploaded = { name: 'Financial Projections', url: '/api/vault/1/private-financials.pdf', review: 'approved' };
  const property = { id: '1', documents: [uploaded] };
  vault.rewritePlaceholderDocs([property]);
  assert.deepEqual(property.documents[0], uploaded);
  assert.equal(property.documents.filter((doc) => doc.name === 'Financial Projections').length, 1);
  assert.equal(property.documents.length, 3);
  const custom = { id: 'not-a-catalog-id', documents: [{ name: 'Deed', url: '/api/vault/custom/file.pdf' }] };
  assert.equal(vault.rewritePlaceholderDocs([custom]), false);
});
