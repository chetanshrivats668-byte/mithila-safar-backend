import { Router } from 'express';
import { requireCollaborator, requireAuth } from '../middleware/auth.js';
import * as collabController from '../controllers/collabController.js';
import { verifyMsg91Token } from '../controllers/auth/authController.js';

const router = Router();

router.post('/register', collabController.registerCollaborator);
router.post('/login', collabController.loginCollaborator);
router.post('/login-with-otp', collabController.loginWithOTP);
router.post('/login-with-phone', collabController.loginWithPhone);
router.post('/verify-msg91-token', verifyMsg91Token);
router.get('/validate-token', requireCollaborator, collabController.validateToken);
router.get('/profile', requireCollaborator, collabController.getProfile);
router.put('/profile', requireCollaborator, collabController.updateProfile);
router.get('/my-roles', requireAuth, collabController.getMyCollaboratorRoles);
router.post('/select-role', requireAuth, collabController.selectCollaboratorRole);
router.post('/submit-partner-collab', requireAuth, collabController.submitPartnerCollab);

router.get('/listings/:type', collabController.getListings);

export default router;
