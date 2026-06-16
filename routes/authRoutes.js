import { Router } from 'express';
import { requireAuth } from '../middleware/auth/authMiddleware.js';
import * as authController from '../controllers/auth/authController.js';

const router = Router();

// Authentication Endpoints
router.post('/signup', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/google', authController.googleLogin);
router.post('/forgot-password-login', authController.forgotPasswordLogin);
router.post('/reset-password', requireAuth, authController.resetPassword);

// Email OTP Endpoints
router.post('/send-email-otp', authController.sendEmailOTP);
router.post('/verify-email-otp', authController.verifyEmailOTP);
router.post('/refresh', authController.refreshAccessToken);

// Profile Management Endpoints
router.get('/me', requireAuth, authController.getCurrentUser);
router.put('/profile', requireAuth, authController.updateUserProfile);
router.post('/mark-phone-verified', requireAuth, authController.markPhoneVerified);

export default router;
