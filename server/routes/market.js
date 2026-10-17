const express = require('express');
const liquidity = require('../controllers/liquidityController');
const controller = require('../controllers/marketController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.snapshot);
router.get('/liquidity/:propertyId', liquidity.snapshot);
router.post('/liquidity/:propertyId/bids', liquidity.bid);
router.delete('/liquidity/:propertyId/bids/:id', liquidity.cancelBid);
router.post('/liquidity/:propertyId/exits', liquidity.createExit);
router.delete('/liquidity/:propertyId/exits/:id', liquidity.cancelExit);
router.post('/liquidity/:propertyId/exits/:id/process', liquidity.executeExit);
router.post('/orders', controller.place);
router.delete('/orders/:id', controller.cancel);

module.exports = router;
