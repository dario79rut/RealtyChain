const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const controller = require('../controllers/incomeController');
router.use(requireAuth);
router.get('/:propertyId', controller.snapshot);
router.post('/:propertyId', requireAdmin, controller.create);
router.post('/:propertyId/:id/pay', requireAdmin, controller.pay);
module.exports = router;
