const { AsyncLocalStorage } = require('async_hooks');

const transactions = new AsyncLocalStorage();
const recordStores = new Set(['app-data', 'server-settings', 'login-activity']);
const schema = require('../db/schema');
let schemaReady = null;

function usesPostgresStorage() {
  if (process.env.DATA_STORAGE_PROVIDER) return process.env.DATA_STORAGE_PROVIDER === 'postgres';
  return Boolean(process.env.DATABASE_URL || process.env.NETLIFY_DB_URL);
}

function namespace() {
  return process.env.DATA_NAMESPACE || process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
}

async function ensureSchema(pool) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '10s'");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('realtychain-schema', 0))");
        await client.query(schema);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally { client.release(); }
    })().catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

async function beginTransaction() {
  if (!process.env.DATABASE_URL && !process.env.NETLIFY_DB_URL) {
    throw Object.assign(new Error('DATABASE_URL or NETLIFY_DB_URL is required for PostgreSQL storage.'), { status: 503 });
  }
  const { pool } = require('../db');
  await ensureSchema(pool);
  const client = await pool.connect();
  let finished = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '45s'");
    // Existing services share a JSON object. Serialize its read/modify/write
    // transaction across ALL function instances, rather than doing Blob CAS.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`realtychain:${namespace()}`]);
    return {
      run: (callback) => transactions.run(client, () => callback(client)),
      async commit() {
        const result = await client.query('COMMIT');
        if (result.command !== 'COMMIT') throw new Error('Database transaction was rolled back.');
        finished = true;
      },
      async rollback() {
        if (!finished) await client.query('ROLLBACK');
        finished = true;
      },
      release: () => client.release(),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
}

async function withTransaction(callback) {
  const transaction = await beginTransaction();
  try {
    const result = await transaction.run(callback);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback().catch(() => {});
    throw err;
  } finally {
    transaction.release();
  }
}

function createPostgresStore(name) {
  if (!recordStores.has(name)) throw new Error('PostgreSQL storage is reserved for app records.');
  function client() {
    const active = transactions.getStore();
    if (!active) throw new Error('Database records require an active request transaction.');
    return active;
  }
  const identity = (key) => [namespace(), name, key];
  return {
    async get(key, { type = 'text' } = {}) {
      const { rows } = await client().query(
        'SELECT value FROM realtychain_records WHERE namespace = $1 AND store_name = $2 AND record_key = $3', identity(key));
      if (!rows.length) return null;
      return type === 'json' ? rows[0].value : JSON.stringify(rows[0].value);
    },
    async set(key, value) {
      // Records are JSON. Binary files continue using the selected file store.
      if (typeof value !== 'string') throw new Error('Database records must be JSON strings.');
      const parsed = JSON.parse(value);
      await client().query(`INSERT INTO realtychain_records (namespace, store_name, record_key, value)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (namespace, store_name, record_key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [...identity(key), JSON.stringify(parsed)]);
    },
    async delete(key) {
      await client().query('DELETE FROM realtychain_records WHERE namespace = $1 AND store_name = $2 AND record_key = $3', identity(key));
    },
    async list({ prefix = '' } = {}) {
      const { rows } = await client().query(`SELECT record_key FROM realtychain_records
        WHERE namespace = $1 AND store_name = $2 AND left(record_key, length($3)) = $3 ORDER BY record_key`, identity(prefix));
      return { blobs: rows.map((row) => ({ key: row.record_key })) };
    },
  };
}

module.exports = { usesPostgresStorage, recordStores, beginTransaction, withTransaction, createPostgresStore, namespace };
