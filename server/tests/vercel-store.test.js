const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fakeVercel } = require('./helpers/fakeVercel');
const { createVercelStore } = require('../storage/vercel');

test('private adapter round-trips JSON and binary with uncached reads', async () => {
  const sdk = fakeVercel();
  const store = createVercelStore('files', { sdk, prefix: 'test' });
  await store.set('data', '{"ok":true}');
  assert.deepEqual(await store.get('data', { type: 'json' }), { ok: true });
  const bytes = Buffer.from([0, 255, 13, 10]);
  await store.set('binary', bytes, { metadata: { contentType: 'application/pdf' } });
  assert.deepEqual(Buffer.from(await store.get('binary', { type: 'arrayBuffer' })), bytes);
  assert.equal(await store.get('missing'), null);
  for (const call of sdk.calls.filter((row) => row.method === 'get')) {
    assert.equal(call.options.access, 'private');
    assert.equal(call.options.useCache, false);
  }
  for (const call of sdk.calls.filter((row) => row.method === 'put')) assert.equal(call.options.access, 'private');
});

test('concurrent snapshot commits reject stale writers without losing newer data', async () => {
  const sdk = fakeVercel();
  sdk.write('test/app-data/data.json', '{"value":1}');
  const first = createVercelStore('app-data', { sdk, prefix: 'test' });
  const second = createVercelStore('app-data', { sdk, prefix: 'test' });
  await first.get('data.json');
  await second.get('data.json');
  await first.set('data.json', '{"value":2}');
  await assert.rejects(second.set('data.json', '{"value":3}'), { status: 409 });
  assert.deepEqual(await second.get('data.json', { type: 'json' }), { value: 2 });
});

test('concurrent initializations never overwrite an already-created snapshot', async () => {
  const sdk = fakeVercel();
  const first = createVercelStore('app-data', { sdk, prefix: 'test' });
  const second = createVercelStore('app-data', { sdk, prefix: 'test' });
  assert.equal(await first.get('data.json'), null);
  assert.equal(await second.get('data.json'), null);
  await first.set('data.json', '{"users":[]}');
  await assert.rejects(second.set('data.json', '{}'), { status: 409 });
});

test('listing follows all pages, returns relative keys, and respects store namespaces', async () => {
  const sdk = fakeVercel();
  const store = createVercelStore('login-activity', { sdk, prefix: 'test' });
  for (let i = 0; i < 5; i++) await store.set(`addresses/${i}`, '{}');
  sdk.write('production/login-activity/addresses/private', '{}');
  const { blobs } = await store.list({ prefix: 'addresses/' });
  assert.deepEqual(blobs.map((blob) => blob.key), ['addresses/0', 'addresses/1', 'addresses/2', 'addresses/3', 'addresses/4']);
  await store.delete('addresses/0');
  assert.equal(await store.get('addresses/0'), null);
});
