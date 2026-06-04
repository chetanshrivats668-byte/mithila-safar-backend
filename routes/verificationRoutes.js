import { Router } from 'express';
import { requireCollaborator, requireAdmin } from '../middleware/auth.js';
import * as verificationController from '../controllers/verificationController.js';

const router = Router();

router.post('/request', requireCollaborator, verificationController.requestVerification);
router.get('/status', requireCollaborator, verificationController.getVerificationStatus);
router.post('/admin-verify', requireAdmin, verificationController.adminVerifyCollaborator);
router.post('/admin-suspend', requireAdmin, verificationController.adminSuspendCollaborator);
router.post('/admin-unsuspend', requireAdmin, verificationController.adminUnsuspendCollaborator);
router.post('/admin/bus-approve', requireAdmin, verificationController.adminApproveService);
router.post('/admin/hotel-approve', requireAdmin, verificationController.adminApproveService);
router.post('/admin/cafe-approve', requireAdmin, verificationController.adminApproveService);
router.post('/admin/cab-approve', requireAdmin, verificationController.adminApproveService);

export default router;
