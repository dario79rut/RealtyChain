const express = require('express');
const controller = require('../controllers/bridgeController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/public', requireAuth, controller.publicTape);
router.get('/desk', requireAuth, controller.desk);
router.post('/positions', requireAuth, controller.createPosition);
router.post('/positions/:linearId/settle', requireAuth, controller.settle);

module.exports = router;
