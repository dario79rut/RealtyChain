const persistence = require('../mock/persistence');
const { usesVercelStorage } = require('./blobs');
const { usesPostgresStorage } = require('./postgres');

// For views that lazily initialize demo data or calculate accruals. The reader
// must be safe to repeat: never pass an order, loan, payment or vote submission.
async function readSnapshot(read) {
  const hosted = usesVercelStorage() || usesPostgresStorage();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const out = await read();
      if (hosted) await persistence.commit();
      return out;
    } catch (err) {
      if (!hosted || err.status !== 409) throw err;
      // Discard failed changes even on the last attempt, so response middleware
      // cannot try to commit the same stale snapshot a second time.
      await persistence.ready({ refresh: true });
      if (attempt === 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

module.exports = { readSnapshot };
