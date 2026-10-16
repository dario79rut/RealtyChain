const { requests, drainWrites } = require('../storage/writes');
const { usesPostgresStorage, beginTransaction } = require('../storage/postgres');

function createStorageMiddleware(persistence) {
  // Serialize this process's shared object. PostgreSQL additionally locks the
  // namespace across function instances until the database commit completes.
  let previous = Promise.resolve();
  return async function storageRequest(req, res, next) {
    const turn = previous;
    let release;
    previous = new Promise((resolve) => { release = resolve; });
    await turn;
    const pending = { writes: [], afterCommit: [] };
    const end = res.end;
    let transaction;
    let failedSetup = false;
    let aborted = res.destroyed;
    let ending = false;
    res.once('close', () => { aborted = true; });
    res.end = function (...args) {
      if (ending) return res;
      ending = true;
      const finish = async () => {
        try {
          await drainWrites(pending.writes);
          if (failedSetup || aborted || (transaction && res.statusCode >= 500)) {
            persistence.discardChanges();
            if (transaction) await transaction.rollback();
          } else {
            // Failed financial actions must not save partial object changes.
            // Authentication history uses its own SQL records and still commits
            // for rejected/blocked logins (401/403).
            if (transaction && res.statusCode >= 400) persistence.discardChanges();
            else await persistence.commit();
            if (transaction) await transaction.commit();
            if (res.statusCode < 400) await Promise.all(pending.afterCommit.map((task) => task()));
          }
          end.apply(res, args);
        } catch (err) {
          persistence.discardChanges();
          if (transaction) await transaction.rollback().catch(() => {});
          console.error('Could not commit request:', { message: err.message, code: err.code, method: req.method, path: req.path });
          if (!res.headersSent) {
            res.statusCode = err.status || 503;
            res.removeHeader('Content-Length');
            res.removeHeader('ETag');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            end.call(res, JSON.stringify({ error: err.status === 409 ? err.message : 'Could not save changes. Please try again.' }));
          } else res.destroy(err);
        } finally {
          if (transaction) transaction.release();
          release();
        }
      };
      void requests.run(pending, () => transaction ? transaction.run(finish) : finish());
      return res;
    };
    try {
      if (usesPostgresStorage()) transaction = await beginTransaction();
      const dispatch = async () => {
        try {
          await persistence.ready({ refresh: true });
          if (aborted) res.end();
          else next();
        } catch (err) { failedSetup = true; next(err); }
      };
      await requests.run(pending, () => transaction ? transaction.run(dispatch) : dispatch());
    } catch (err) { failedSetup = true; next(err); }
  };
}

module.exports = { createStorageMiddleware };
