const express = require('express');
const controller = require('../controllers/marketController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.snapshot);
router.post('/orders', controller.place);
router.delete('/orders/:id', controller.cancel);

module.exports = router;
