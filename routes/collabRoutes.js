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
router.get('/profile', requireCollaborator, collabController.getProfile);
router.put('/profile', requireCollaborator, collabController.updateProfile);
router.get('/listings/:type', collabController.getListings);

export default router;
