const router = require('express').Router();
const crypto = require('node:crypto');
const { requireAuth } = require('../middleware/auth');
const service = require('../services/investmentPlanService');
const endpoint = (fn, status = 200) => (req, res) => { try { res.status(status).json(fn(req)); } catch (error) { res.status(error.status || 500).json({ error: error.message }); } };
router.post('/process-due', (req, res, next) => {
  const expected = process.env.INVESTMENT_SCHEDULER_SECRET || '';
  const supplied = Buffer.from(String(req.headers['x-scheduler-secret'] || ''));
  const expectedBytes = Buffer.from(expected);
  if (expected.length < 32 || supplied.length !== expectedBytes.length || !crypto.timingSafeEqual(supplied, expectedBytes)) return res.status(403).json({ error: 'Scheduler authentication required.' });
  next();
}, endpoint(() => service.runAll()));
router.use(requireAuth);
router.get('/', endpoint((req) => service.snapshot(req.user.sub, req.query.property)));
router.post('/', endpoint((req) => service.create(req.user.sub, req.body || {}), 201));
router.patch('/:id', endpoint((req) => service.change(req.user.sub, req.params.id, req.body?.status)));
router.post('/run-due', endpoint((req) => service.runDue(req.user.sub, req.body?.propertyId)));
module.exports = router;
