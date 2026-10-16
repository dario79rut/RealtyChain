require('dotenv').config();
const { createVercelStore } = require('../server/storage/vercel');
const { migrateRecords } = require('../server/db/migrate');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--apply', '--replace-existing'].includes(arg))) {
    throw new Error('Usage: npm run migrate:postgres -- [--apply] [--replace-existing]');
  }
  // Source reads deliberately bypass the configured PostgreSQL record adapter.
  // They do not modify or delete any existing Blob objects.
  const stores = new Map();
  const source = (name) => {
    if (!stores.has(name)) stores.set(name, createVercelStore(name));
    return stores.get(name);
  };
  const result = await migrateRecords({ source, apply: args.includes('--apply'), replaceExisting: args.includes('--replace-existing') });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(async () => { await require('../server/db').pool.end(); });
