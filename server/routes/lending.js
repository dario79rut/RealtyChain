const express = require('express');
const controller = require('../controllers/lendingController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.snapshot);
router.post('/supply', controller.supply);
router.post('/withdraw', controller.withdraw);
router.post('/borrow', controller.borrow);
router.post('/repay', controller.repay);
router.post('/release', controller.release);
router.post('/liquidate/:id', controller.liquidate);

module.exports = router;
