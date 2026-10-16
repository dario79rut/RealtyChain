const { requests, drainWrites } = require('../storage/writes');

function createStorageMiddleware(persistence) {
  // Services share an in-memory snapshot. Serialize requests within a warm
  // instance; ETags protect commits made concurrently by other instances.
  let previous = Promise.resolve();
  return async function storageRequest(req, res, next) {
    const turn = previous;
    let release;
    previous = new Promise((resolve) => { release = resolve; });
    await turn;
    const pending = { writes: [], afterCommit: [] };
    const end = res.end;
    let ending = false;
    res.end = function (...args) {
      if (ending) return res;
      ending = true;
      void (async () => {
        try {
          await drainWrites(pending.writes);
          await persistence.commit();
          await Promise.all(pending.afterCommit.map((task) => task()));
          end.apply(res, args);
        } catch (err) {
          console.error('Could not commit request:', err.message);
          if (!res.headersSent) {
            res.statusCode = err.status || 503;
            res.removeHeader('Content-Length');
            res.removeHeader('ETag');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            end.call(res, JSON.stringify({ error: err.status === 409 ? err.message : 'Could not save changes. Please try again.' }));
          } else {
            res.destroy(err);
          }
        } finally {
          release();
        }
      })();
      return res;
    };
    requests.run(pending, async () => {
      try {
        await persistence.ready({ refresh: true });
        next();
      } catch (err) {
        next(err);
      }
    });
  };
}

module.exports = { createStorageMiddleware };
