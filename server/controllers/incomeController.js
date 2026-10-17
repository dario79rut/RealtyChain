const service = require('../services/incomeService');
const handler = (action, status = 200) => (req, res) => {
  try { res.status(status).json(action(req.user.sub, req.params.propertyId, req.params.id, req.body || {})); }
  catch (error) { res.status(error.status || 500).json({ error: error.message }); }
};
module.exports = {
  snapshot: handler((user, property) => service.snapshot(user, property)),
  create: handler((user, property, _id, input) => service.create(user, property, input), 201),
  pay: handler((user, property, id) => service.pay(user, property, id)),
};
