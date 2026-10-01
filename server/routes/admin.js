const express = require('express');
const controller = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);
router.get('/', controller.snapshot);
router.post('/actions', controller.action);

module.exports = router;
