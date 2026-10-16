const { randomUUID } = require('crypto');
const { recordStores, namespace, withTransaction, createPostgresStore } = require('../storage/postgres');

async function migrateRecords({ source, apply = false, replaceExisting = false }) {
  const records = [];
  for (const name of recordStores) {
    const store = source(name);
    const { blobs } = await store.list();
    for (const { key } of blobs) {
      const raw = await store.get(key, { type: 'text' });
      if (raw === null) throw new Error(`Source record disappeared: ${name}/${key}. Retry the migration.`);
      records.push({ name, key, value: JSON.parse(raw) });
    }
  }
  const state = records.find((row) => row.name === 'app-data' && row.key === 'data.json')?.value;
  if (!Array.isArray(state?.users) || !Array.isArray(state?.properties)) {
    throw new Error('Source does not contain valid app data. Check BLOB_PREFIX and the source store.');
  }
  const counts = Object.fromEntries([...recordStores].map((name) => [name, records.filter((row) => row.name === name).length]));
  if (!apply) return { applied: false, namespace: namespace(), records: counts };

  return withTransaction(async (client) => {
    const current = namespace();
    const existing = await createPostgresStore('app-data').get('data.json');
    if (existing !== null && !replaceExisting) {
      throw new Error('Destination already contains app data. Inspect it first; use --replace-existing only if it should be replaced.');
    }
    const { rows } = await client.query('SELECT count(*)::int AS count FROM realtychain_records WHERE namespace = $1', [current]);
    let backupNamespace;
    if (rows[0].count > 0) {
      backupNamespace = `${current}/backup-${randomUUID()}`;
      await client.query(`INSERT INTO realtychain_records (namespace, store_name, record_key, value)
        SELECT $2, store_name, record_key, value FROM realtychain_records WHERE namespace = $1`, [current, backupNamespace]);
      await client.query('DELETE FROM realtychain_records WHERE namespace = $1', [current]);
    }
    for (const record of records) {
      await createPostgresStore(record.name).set(record.key, JSON.stringify(record.value));
    }
    return { applied: true, namespace: current, records: counts, ...(backupNamespace ? { backupNamespace } : {}) };
  });
}

module.exports = { migrateRecords };
