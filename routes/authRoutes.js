import { Router } from 'express';
import { requireAuth } from '../middleware/auth/authMiddleware.js';
import * as authController from '../controllers/auth/authController.js';

const router = Router();

// Authentication Endpoints
router.post('/signup', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/google', authController.googleLogin);

// Email OTP Endpoints
router.post('/send-email-otp', authController.sendEmailOTP);
router.post('/verify-email-otp', authController.verifyEmailOTP);
router.post('/send-phone-otp', authController.sendPhoneOTP);
router.post('/verify-phone-otp', authController.verifyPhoneOTP);
router.post('/complete-phone-profile', authController.completePhoneProfile);
router.post('/verify-msg91-token', authController.verifyMsg91Token);
router.post('/refresh', authController.refreshAccessToken);

// Profile Management Endpoints
router.get('/me', requireAuth, authController.getCurrentUser);
router.put('/profile', requireAuth, authController.updateUserProfile);

export default router;
