const express = require('express');
const controller = require('../controllers/searchController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, controller.list);
router.post('/', requireAuth, controller.create);
router.delete('/:id', requireAuth, controller.remove);

module.exports = router;
