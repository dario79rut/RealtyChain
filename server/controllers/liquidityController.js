const service = require('../services/liquidityService');
const { readSnapshot } = require('../storage/readSnapshot');
function endpoint(action, status = 200, read = false) {
  return async (req, res) => {
    try {
      const run = () => action(req.user.sub, req.params.propertyId, req.params.id, req.body || {});
      return res.status(status).json(await (read ? readSnapshot(run) : run()));
    } catch (error) {
      if ((error.status || 500) >= 500) console.error('Liquidity error:', error);
      return res.status(error.status || 500).json({ error: error.message || 'Request failed.' });
    }
  };
}
module.exports = {
  snapshot: endpoint((user, property) => service.snapshot(user, property), 200, true),
  bid: endpoint((user, property, _id, input) => service.bid(user, property, input), 201),
  cancelBid: endpoint((user, property, id) => service.cancelBid(user, property, id)),
  createExit: endpoint((user, property, _id, input) => service.createExit(user, property, input), 201),
  cancelExit: endpoint((user, property, id) => service.cancelExit(user, property, id)),
  executeExit: endpoint((user, property, id) => service.executeExit(user, property, id)),
};
