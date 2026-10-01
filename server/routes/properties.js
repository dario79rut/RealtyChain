const express = require('express');
const controller = require('../controllers/propertyController');
const vaultController = require('../controllers/vaultController');
const ownerController = require('../controllers/ownerController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, controller.list);
router.post('/mine', requireAuth, ownerController.register);
router.patch('/mine/:id', requireAuth, ownerController.update);
router.post('/mine/:id/documents', requireAuth, ownerController.uploadDocument);
router.post('/mine/:id/verify', requireAuth, ownerController.verify);
router.post('/mine/:id/progress', requireAuth, ownerController.progress);
router.post('/mine/:id/campaign', requireAuth, ownerController.campaign);
router.post('/mine/:id/tokenize', requireAuth, ownerController.tokenize);
router.post('/mine/:id/finance/apply', requireAuth, ownerController.financeApply);
router.post('/mine/:id/finance/accept', requireAuth, ownerController.financeAccept);
router.post('/mine/:id/finance/repay', requireAuth, ownerController.financeRepay);
router.post('/:id/campaign/pledge', requireAuth, ownerController.pledge);
router.post('/', requireAdmin, controller.create);
router.post('/:id/documents', requireAdmin, vaultController.upload);
router.delete('/:id/documents/:index', requireAdmin, vaultController.remove);
router.get('/:id', requireAuth, controller.get);
router.patch('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);

module.exports = router;
