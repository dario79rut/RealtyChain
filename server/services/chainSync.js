async function syncFromChain(_catalog, store) {
  return {
    synced: true,
    latest: Number(store?.cursor || 0),
    events: [],
  };
}

module.exports = { syncFromChain };
