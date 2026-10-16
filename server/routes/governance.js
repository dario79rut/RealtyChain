const express = require('express');
const controller = require('../controllers/governanceController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/vote', controller.vote);
router.post('/:id/respond', controller.respond);
router.put('/properties/:propertyId/agreement', controller.configureAgreement);

module.exports = router;
