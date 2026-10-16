const { AsyncLocalStorage } = require('async_hooks');

const requests = new AsyncLocalStorage();

// Existing services return their result synchronously. Register their async
// uploads immediately so the serverless response can wait for durable storage.
function scheduleWrite(task, { afterCommit = false } = {}) {
  const pending = requests.getStore();
  if (pending && afterCommit) {
    pending.afterCommit.push(task);
    return;
  }
  const promise = Promise.resolve().then(task);
  if (pending) pending.writes.push(promise);
  promise.catch((err) => console.error('Storage write failed:', err.message));
}

async function drainWrites(pending) {
  let offset = 0;
  while (offset < pending.length) {
    const batch = pending.slice(offset);
    offset = pending.length;
    const results = await Promise.allSettled(batch);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
}

module.exports = { requests, scheduleWrite, drainWrites };
