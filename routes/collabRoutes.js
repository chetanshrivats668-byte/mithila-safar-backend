import { requireAuth } from '../middleware/auth.js';

import { Router } from 'express';
import { requireCollaborator } from '../middleware/auth.js';
import * as collabController from '../controllers/collabController.js';

const router = Router();

router.post('/register', collabController.registerCollaborator);
router.post('/login', collabController.loginCollaborator);
router.post('/login-with-otp', collabController.loginWithOTP);
router.post('/login-with-phone', collabController.loginWithPhoneOTP);
router.post('/send-otp', collabController.sendOTP);
router.post('/verify-otp', collabController.verifyOTP);
router.get('/validate-token', requireCollaborator, collabController.validateToken);
router.get('/profile', requireCollaborator, collabController.getProfile);
router.put('/profile', requireCollaborator, collabController.updateProfile);
router.get('/my-roles', requireAuth, collabController.getMyCollaboratorRoles);
router.post('/select-role', requireAuth, collabController.selectCollaboratorRole);

router.get('/listings/:type', collabController.getListings);

export default router;
