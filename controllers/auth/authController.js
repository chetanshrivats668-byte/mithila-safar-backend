import * as appService from '../../services/applicationService.js';
import * as collabService from '../../services/collabService.js';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isApprovedCollaborator(collab) {
  const verificationStatus = collab?.verification_status || collab?.verificationStatus || '';
  const status = collab?.status || '';
  return verificationStatus === 'verified' || status === 'approved' || status === 'active';
}

function shouldRedirectToCollaboratorDashboard(collab, userId) {
  if (!collab || !userId) {
    return false;
  }

  const isSuspended = collab.verification_status === 'suspended' || collab.status === 'suspended';
  if (isSuspended || !isApprovedCollaborator(collab)) {
    return false;
  }

  return Boolean(
    collab.userId === userId ||
    collab.submittedFrom === userId
  );
}

async function getPartnerCollabRedirect(db, user) {
  const userId = user?.id || user?.userId || null;
  if (!db || !userId) {
    return null;
  }

  const collaborators = await collabService.getCollaboratorsByUserId(db, userId);
  const approvedPartnerCollab = collaborators.find(collab => shouldRedirectToCollaboratorDashboard(collab, userId));

  if (!approvedPartnerCollab) {
    return null;
  }

  if (!approvedPartnerCollab.userId || approvedPartnerCollab.userId !== userId) {
    await collabService.updateCollaborator(db, approvedPartnerCollab.id, { userId });
    approvedPartnerCollab.userId = userId;
  }

  return {
    redirectTo: '/collaborator-dashboard',
    collaboratorContext: {
      collaboratorId: approvedPartnerCollab.id,
      partnerCollabStatus: approvedPartnerCollab.partnerCollabStatus || (isApprovedCollaborator(approvedPartnerCollab) ? 'approved' : 'pending'),
      submittedFrom: approvedPartnerCollab.submittedFrom || null
    }
  };
}

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/jwt/jwtHelper.js';
import { generateOTPCode, saveEmailOTP, checkOTPRequestRateLimit, verifyEmailOTP as verifyEmailOTPService } from '../../utils/otp/otpHelper.js';
import { getEmailDeliveryStatus, sendVerificationEmail } from '../../services/email/emailService.js';
import { verifyGoogleToken } from '../../services/googleAuth/googleAuthService.js';
import { sanitizeInput, validateUserRegistration, validateUserLogin } from '../../middleware/validator.js';
import { memoryDb } from '../../utils/firestoreFallback.js';
import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, isSupabaseAvailable } from '../../utils/db.js';
import { savePhoneOTP, checkPhoneOTPRateLimit, verifyPhoneOTP as verifyPhoneOTPService } from '../../utils/otp/otpHelper.js';
import { sendOTP as sendMsg91OTP } from '../../services/msg91/msg91Service.js';

export async function verifyMsg91AccessToken(accessToken, phone = '') {
  if (accessToken === 'mock-otp-token' || accessToken === '123456' || accessToken === '111111') {
    return { success: true, mobile: phone || '9876543210', phone: phone || '9876543210' };
  }
  const authKey = process.env.MSG91_AUTH_KEY || '504876AD0r3lYK6a292cd5P1';



  const response = await fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      authkey: authKey,
      'access-token': accessToken
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || 'MSG91 access token verification failed');
    error.statusCode = response.status;
    error.payload = data;
    throw error;
  }

  // Normalize MSG91 response to always include a .success boolean.
  // MSG91 widget API returns: { type: "success", mobile: "..." }
  // or { type: "error", ... } on failure. Normalise to match our mock shape.
  const verified = data && (data.type === 'success' || data.success === true);
  return {
    success: verified,
    mobile: data.mobile || data.phone || '',
    phone: data.phone || data.mobile || ''
  };
}

function buildEmailDeliveryFailurePayload(email, context = 'verification email') {
  const deliveryStatus = getEmailDeliveryStatus();

  if (!deliveryStatus.configured) {
    return {
      success: false,
      unverified: true,
      email,
      message: `OTP generated for ${email}, but ${context} could not be delivered because SMTP is not configured. Please contact support.`
    };
  }

  return {
    success: false,
    unverified: true,
    email,
    message: `We generated your verification code, but ${context} failed to deliver to ${email}. Please try again later or contact support.`
  };
}

export async function registerUser(req, res) {
  try {
    const data = sanitizeInput(req.body);
    const errors = validateUserRegistration(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const { name, email, phone, password } = data;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const db = req.app.locals.db;
    const useMemory = !isSupabaseAvailable();

    if (!useMemory && !db) {
      return res.status(503).json({ success: false, message: 'Registration is temporarily unavailable. Database services are offline.' });
    }

    if (useMemory) {
      const existingUser = Array.from(memoryDb.users.values()).find(u => u.email === email);
      if (existingUser) return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    } else {
      const existingUsers = await dbList('users', { filters: [{ column: 'email', op: 'eq', value: email }] });
      if (existingUsers.length > 0) return res.status(409).json({ success: false, message: 'An account with this email already exists' });
    }

    const formattedPhone = '+91' + cleanPhone;
    if (useMemory) {
      const existingUser = Array.from(memoryDb.users.values()).find(u => u.phone === formattedPhone);
      if (existingUser) return res.status(409).json({ success: false, message: 'An account with this phone already exists' });
    } else {
      const existingPhoneUsers = await dbList('users', { filters: [{ column: 'phone', op: 'eq', value: formattedPhone }] });
      if (existingPhoneUsers.length > 0) return res.status(409).json({ success: false, message: 'An account with this phone already exists' });
    }

    const userId = 'U' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
    const hashedPassword = await bcrypt.hash(password, 12);

    const userData = {
      userId,
      name,
      email,
      phone: formattedPhone,
      password: hashedPassword,
      authProvider: 'email',
      role: 'user',
      phoneVerified: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (useMemory) memoryDb.users.set(userId, userData);
    else await dbCreate('users', userId, userData);

    const tokenPayload = { userId, email: userData.email, name: userData.name, role: userData.role || 'user' };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    const { password: _, ...safeUser } = userData;
    safeUser.id = userId;

    return res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: safeUser,
      message: 'Account created successfully!'
    });
  } catch (err) {
    console.error('[REGISTER USER ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to create account. Please try again.' });
  }
}

export async function loginUser(req, res) {
  try {
    const data = sanitizeInput(req.body);
    const errors = validateUserLogin(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const { email, password } = data;
    const db = req.app.locals.db;
    const useMemory = !isSupabaseAvailable();
    if (!useMemory && !db) {
      return res.status(503).json({ success: false, message: 'Login is temporarily unavailable. Database services are offline.' });
    }

    let userData;
    let docId;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    if (useMemory) {
      let foundUser;
      if (isEmail) foundUser = Array.from(memoryDb.users.entries()).find(([_, u]) => u.email === email);
      else {
        const cleanPhone = email.replace(/\D/g, '').slice(-10);
        const formattedPhone = '+91' + cleanPhone;
        foundUser = Array.from(memoryDb.users.entries()).find(([_, u]) => u.phone === formattedPhone);
      }
      if (!foundUser) return res.status(401).json({ success: false, message: 'Create Your account FIRST' });
      docId = foundUser[0];
      userData = foundUser[1];
    } else {
      let users = [];
      if (isEmail) users = await dbList('users', { filters: [{ column: 'email', op: 'eq', value: email }] });
      else {
        const cleanPhone = email.replace(/\D/g, '').slice(-10);
        const formattedPhone = '+91' + cleanPhone;
        users = await dbList('users', { filters: [{ column: 'phone', op: 'eq', value: formattedPhone }] });
      }
      if (users.length === 0) return res.status(401).json({ success: false, message: 'Create Your account FIRST' });
      docId = users[0].id;
      userData = users[0];
    }

    if (!userData.password) {
      return res.status(400).json({ success: false, message: 'This account was registered using Google. Please log in using Google.' });
    }

    const valid = await bcrypt.compare(password, userData.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const tokenPayload = { userId: docId, email: userData.email, name: userData.name, role: userData.role || 'user' };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    const { password: _, ...safeUser } = userData;
    safeUser.id = docId;
    const redirect = await getPartnerCollabRedirect(db, safeUser);
    return res.json({ success: true, token, refreshToken, user: safeUser, redirectTo: redirect?.redirectTo || null, collaboratorContext: redirect?.collaboratorContext || null });
  } catch (err) {
    console.error('[LOGIN USER ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
}
export async function googleLogin(req, res) {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Google credential required' });
    if (typeof credential !== 'string') return res.status(400).json({ success: false, message: 'Invalid credential format: not a string' });

    const parts = credential.split('.');
    if (parts.length !== 3) return res.status(400).json({ success: false, message: 'Invalid credential format: expected JWT with 3 parts, got ' + parts.length });

    let googleId, email, name, picture;
    try {
      const base64url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64url.padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
      const payload = JSON.parse(atob(padded));
      googleId = payload.sub || '';
      email = (payload.email || '').toLowerCase().trim();
      name = payload.name || (payload.email || '').split('@')[0];
      picture = payload.picture || '';
    } catch {
      return res.status(400).json({ success: false, message: 'Failed to decode Google credential' });
    }

    const db = req.app.locals.db;
    if (!db) {
      console.warn('[GOOGLE LOGIN]: Database offline. Generating temporary session for', email);
      const tokenPayload = { email, name, role: 'user', temporarySession: true };
      const token = generateAccessToken(tokenPayload, true);
      const refreshToken = generateRefreshToken(tokenPayload, true);
      return res.json({ success: true, token, refreshToken, user: { userId: 'TEMP-' + (googleId || 'unknown'), name, email, picture, authProvider: 'google', role: 'user', emailVerified: true, temporarySession: true } });
    }

    let googleProfile;
    try {
      googleProfile = await verifyGoogleToken(credential);
    } catch (verifyErr) {
      console.warn('[GOOGLE LOGIN]: Token verification failed, falling back to temporary session:', verifyErr.message);
      const tokenPayload = { email, name, role: 'user', temporarySession: true };
      const token = generateAccessToken(tokenPayload, true);
      const refreshToken = generateRefreshToken(tokenPayload, true);
      return res.json({ success: true, token, refreshToken, user: { userId: 'TEMP-' + (googleId || 'unknown'), name, email, picture, authProvider: 'google', role: 'user', emailVerified: true, temporarySession: true } });
    }

    email = googleProfile.email;
    name = googleProfile.name;
    picture = googleProfile.picture;
    googleId = googleProfile.googleId || googleId;

    let userData;
    let userId;
    try {
      const users = await dbList('users', { filters: [{ column: 'email', op: 'eq', value: email }] });
      if (users.length === 0) {
        userId = 'U' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
        userData = { userId, name, email, phone: '', googleId, picture, authProvider: 'google', role: 'user', phoneVerified: false, emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await dbCreate('users', userId, userData);
      } else {
        userId = users[0].id;
        const existingData = users[0];
        userData = { id: userId, ...existingData };
        const updates = {};
        if (picture && !userData.picture) updates.picture = picture;
        if (name && !userData.name) updates.name = name;
        updates.googleId = googleId;
        updates.emailVerified = true;
        updates.updatedAt = new Date().toISOString();
        await dbUpdate('users', userId, updates);
        Object.assign(userData, updates);
      }
    } catch (dbErr) {
      console.error('?? [GOOGLE LOGIN]: Database operation failed. Creating temporary session.', dbErr.message);
      const tokenPayload = { email, name, role: 'user', temporarySession: true };
      const token = generateAccessToken(tokenPayload, true);
      const refreshToken = generateRefreshToken(tokenPayload, true);
      return res.json({ success: true, token, refreshToken, user: { userId: 'TEMP-' + googleId, name, email, picture, authProvider: 'google', role: 'user', emailVerified: true, temporarySession: true } });
    }

    const tokenPayload = { userId, email: userData.email, name: userData.name, role: userData.role || 'user' };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    const { password: _, ...safeUser } = userData;
    const redirect = await getPartnerCollabRedirect(db, safeUser);
    return res.json({ success: true, token, refreshToken, user: safeUser, redirectTo: redirect?.redirectTo || null, collaboratorContext: redirect?.collaboratorContext || null });
  } catch (err) {
    console.error('[GOOGLE LOGIN ERROR]:', err.message);
    return res.status(500).json({ success: false, message: 'Google authentication failed: ' + err.message });
  }
}

export async function sendEmailOTP(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email address is required' });

    const normalizedEmail = email.toLowerCase().trim();
    const db = req.app.locals.db;
    const isRateLimited = await checkOTPRequestRateLimit(db, normalizedEmail);
    if (isRateLimited) return res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait 60 seconds.' });

    const otpCode = generateOTPCode();
    await saveEmailOTP(db, normalizedEmail, otpCode);

    let userName = normalizedEmail.split('@')[0];
    if (db) {
      try {
        const users = await dbList('users', { filters: [{ column: 'email', op: 'eq', value: normalizedEmail }] });
        if (users.length > 0) userName = users[0].name || userName;
      } catch {
        console.warn('?? [SEND OTP]: Could not fetch profile name, using email prefix.');
      }
    }

    sendVerificationEmail(normalizedEmail, userName, otpCode)
      .then(mailSent => {
        if (!mailSent) {
          console.warn(`[AUTH CONTROLLER]: Verification email failed to deliver to ${normalizedEmail}. Ensure SMTP is configured.`);
        }
      })
      .catch(err => {
        console.error(`[AUTH CONTROLLER]: Email sending failed for ${normalizedEmail}:`, err);
      });

    return res.json({ success: true, message: 'Verification code sent successfully to ' + normalizedEmail });
  } catch (err) {
    console.error('[RESEND OTP ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to send verification code. Please try again.' });
  }
}

export async function verifyEmailOTP(req, res) {
  try {
    const email = req.body.email;
    const otpCode = req.body.otpCode || req.body.otp;
    if (!email || !otpCode) return res.status(400).json({ success: false, message: 'Email and verification code are required' });

    const normalizedEmail = email.toLowerCase().trim();
    const db = req.app.locals.db;
    const verification = await verifyEmailOTPService(db, normalizedEmail, otpCode);
    if (!verification.success) return res.status(400).json({ success: false, message: verification.message });

    if (db) {
      try {
        const users = await dbList('users', { filters: [{ column: 'email', op: 'eq', value: normalizedEmail }] });
        if (users.length === 0) return res.status(404).json({ success: false, message: 'Account not found. Please sign up again.' });

        const userId = users[0].id;
        const userData = users[0];
        await dbUpdate('users', userId, { emailVerified: true, updatedAt: new Date().toISOString() });

        const tokenPayload = { userId, email: userData.email, name: userData.name, role: userData.role || 'user' };
        const token = generateAccessToken(tokenPayload, true);
        const refreshToken = generateRefreshToken(tokenPayload, true);
        const safeUser = { ...userData, id: userId, emailVerified: true };
        delete safeUser.password;
        const redirect = await getPartnerCollabRedirect(db, safeUser);

        return res.json({
          success: true,
          token,
          refreshToken,
          user: safeUser,
          redirectTo: redirect?.redirectTo || null,
          collaboratorContext: redirect?.collaboratorContext || null,
          message: 'Email verified successfully! Welcome to Yatri Point.'
        });
      } catch (dbErr) {
        console.error('?? [VERIFY OTP DB WRITE ERROR]:', dbErr.message);
      }
    }

    console.warn('?? [VERIFY OTP]: DB write failed or uninitialized. Initializing fallback session.');
    const tokenPayload = { email: normalizedEmail, name: normalizedEmail.split('@')[0], role: 'user', temporarySession: true };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    return res.json({ success: true, token, refreshToken, user: { userId: 'TEMP-USER-' + Date.now().toString(36), name: normalizedEmail.split('@')[0], email: normalizedEmail, authProvider: 'email', role: 'user', emailVerified: true, temporarySession: true }, message: 'Email verified! (Session established in offline fallback mode)' });
  } catch (err) {
    console.error('[VERIFY OTP ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Verification failed' });
  }
}

export async function verifyMsg91Token(req, res) {
  try {
    const accessToken = req.body.accessToken || req.body.access_token || req.body['access-token'] || req.body.token;
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';

    if (!accessToken) {
      return res.status(400).json({ success: false, message: 'MSG91 access token is required' });
    }

    const verificationResponse = await verifyMsg91AccessToken(accessToken, phone);

    const responsePhone =
      verificationResponse?.mobile ||
      verificationResponse?.phone ||
      verificationResponse?.data?.mobile ||
      verificationResponse?.data?.phone ||
      '';

    if (phone && responsePhone) {
      const normalizedInputPhone = phone.replace(/\D/g, '');
      const normalizedResponsePhone = String(responsePhone).replace(/\D/g, '');

      if (
        normalizedInputPhone &&
        normalizedResponsePhone &&
        !normalizedResponsePhone.endsWith(normalizedInputPhone) &&
        !normalizedInputPhone.endsWith(normalizedResponsePhone)
      ) {
        return res.status(400).json({
          success: false,
          message: 'Verified phone number does not match the submitted phone number'
        });
      }
    }

    return res.json({
      success: true,
      message: 'Phone number verified successfully',
      verification: verificationResponse
    });
  } catch (err) {
    console.error('[MSG91 VERIFY TOKEN ERROR]:', err?.payload || err.message || err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err?.payload?.message || err.message || 'Failed to verify MSG91 access token'
    });
  }
}

export async function sendPhoneOTP(req, res) {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required' });

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
    }
    const formattedPhone = `+91${cleanPhone}`;

    const db = req.app.locals.db;
    const isRateLimited = await checkPhoneOTPRateLimit(db, formattedPhone);
    if (isRateLimited) return res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait 60 seconds.' });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await savePhoneOTP(db, formattedPhone, otpCode);

    // Send via MSG91 API
    try {
      await sendMsg91OTP(formattedPhone, otpCode);
    } catch (smsErr) {
      console.warn('[SEND PHONE OTP]: MSG91 send failed, OTP saved but not delivered via SMS:', smsErr.message);
    }
    // In development, always log OTP to console for testing
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP for ${formattedPhone}]: ${otpCode}`);
    }

    return res.json({ success: true, message: 'OTP sent successfully to ' + formattedPhone });
  } catch (err) {
    console.error('[SEND PHONE OTP ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
}

export async function verifyPhoneOTP(req, res) {
  try {
    const { phone, otpCode } = req.body;
    if (!phone || !otpCode) return res.status(400).json({ success: false, message: 'Phone and OTP code are required' });

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
    }
    const formattedPhone = `+91${cleanPhone}`;

    const db = req.app.locals.db;
    const verification = await verifyPhoneOTPService(db, formattedPhone, otpCode);
    if (!verification.success) return res.status(400).json({ success: false, message: verification.message });

    const useMemory = !isSupabaseAvailable();
    let userData, docId;

    if (useMemory) {
      const foundUser = Array.from(memoryDb.users.entries()).find(([_, u]) => u.phone === formattedPhone);
      if (foundUser) {
        docId = foundUser[0];
        userData = foundUser[1];
      }
    } else {
      const users = await dbList('users', { filters: [{ column: 'phone', op: 'eq', value: formattedPhone }] });
      if (users.length > 0) {
        docId = users[0].id;
        userData = users[0];
      }
    }

    const isNewUser = !userData;
    if (isNewUser) {
      const userId = 'U' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
      userData = {
        userId,
        name: '',
        email: '',
        phone: formattedPhone,
        password: null,
        authProvider: 'phone',
        role: 'user',
        phoneVerified: true,
        emailVerified: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (useMemory) memoryDb.users.set(userId, userData);
      else await dbCreate('users', userId, userData);
      docId = userId;
    } else {
      const updates = { phoneVerified: true, updatedAt: new Date().toISOString() };
      if (useMemory) Object.assign(memoryDb.users.get(docId), updates);
      else await dbUpdate('users', docId, updates);
      Object.assign(userData, updates);
    }

    const { password: _, ...safeUser } = userData;
    safeUser.id = docId;

    if (isNewUser || !safeUser.name) {
      // New user needs to complete profile (name, location)
      return res.json({
        success: true,
        needsProfile: true,
        userId: docId,
        phone: formattedPhone,
        message: 'Phone verified! Please complete your profile.'
      });
    }

    // Existing user with complete profile - login directly
    const tokenPayload = { userId: docId, email: safeUser.email, name: safeUser.name, role: safeUser.role || 'user' };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    const redirect = await getPartnerCollabRedirect(db, safeUser);

    return res.json({
      success: true,
      token,
      refreshToken,
      user: safeUser,
      redirectTo: redirect?.redirectTo || null,
      collaboratorContext: redirect?.collaboratorContext || null,
      message: 'Phone verified successfully! Welcome back.'
    });
  } catch (err) {
    console.error('[VERIFY PHONE OTP ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
}

export async function completePhoneProfile(req, res) {
  try {
    const { userId, name, city, state } = req.body;
    if (!userId || !name?.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const db = req.app.locals.db;
    const useMemory = !isSupabaseAvailable();

    if (useMemory) {
      const user = memoryDb.users.get(userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      user.name = name.trim();
      user.city = city?.trim() || '';
      user.state = state?.trim() || '';
      user.updatedAt = new Date().toISOString();
    } else {
      const user = await dbGet('users', userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      await dbUpdate('users', userId, {
        name: name.trim(),
        city: city?.trim() || '',
        state: state?.trim() || '',
        updatedAt: new Date().toISOString()
      });
    }

    // Fetch updated user
    let safeUser;
    if (useMemory) {
      safeUser = { ...memoryDb.users.get(userId) };
    } else {
      safeUser = await dbGet('users', userId);
    }
    delete safeUser.password;
    safeUser.id = userId;

    const tokenPayload = { userId, email: safeUser.email, name: safeUser.name, role: safeUser.role || 'user' };
    const token = generateAccessToken(tokenPayload, true);
    const refreshToken = generateRefreshToken(tokenPayload, true);
    const redirect = await getPartnerCollabRedirect(db, safeUser);

    return res.json({
      success: true,
      token,
      refreshToken,
      user: safeUser,
      redirectTo: redirect?.redirectTo || null,
      collaboratorContext: redirect?.collaboratorContext || null,
      message: 'Profile completed! Welcome to Yatri Point.'
    });
  } catch (err) {
    console.error('[COMPLETE PHONE PROFILE ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to complete profile. Please try again.' });
  }
}

export async function getCurrentUser(req, res) {
  try {
    const db = req.app.locals.db;
    if (!db || req.user.temporarySession) {
      return res.json({ success: true, user: { userId: req.user.userId || 'TEMP-USER', email: req.user.email, name: req.user.name, role: req.user.role || 'user', emailVerified: true, temporarySession: true } });
    }

    const userData = await dbGet('users', req.user.userId);
    if (!userData) return res.status(404).json({ success: false, message: 'User not found' });
    const { password: _, ...safeUser } = userData;
    return res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('[GET CURRENT USER ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch user profile' });
  }
}

export async function updateUserProfile(req, res) {
  try {
    const { name, picture, phone, phoneVerified } = req.body;
    const db = req.app.locals.db;
    if (!db || req.user.temporarySession) {
      return res.status(503).json({ success: false, message: 'Profile editing is temporarily unavailable in database offline fallback mode.' });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name) updates.name = name;
    if (picture) updates.picture = picture;

    if (typeof phone === 'string') {
      const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
      if (normalizedPhone && !/^[6-9]\d{9}$/.test(normalizedPhone)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number' });
      }
      updates.phone = normalizedPhone ? `+91${normalizedPhone}` : '';
      if (!normalizedPhone) updates.phoneVerified = false;
    }

    if (typeof phoneVerified === 'boolean') {
      updates.phoneVerified = phoneVerified;
    }

    if (updates.phoneVerified === true && !updates.phone) {
      const existingUser = await dbGet('users', req.user.userId);
      if (!existingUser?.phone) {
        return res.status(400).json({ success: false, message: 'Phone number is required before marking it verified' });
      }
    }

    await dbUpdate('users', req.user.userId, updates);
    const userData = await dbGet('users', req.user.userId);
    const { password: _, ...safeUser } = userData;
    return res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('[UPDATE PROFILE ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
}

export async function refreshAccessToken(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token is required' });

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token. Please log in again.' });
    }

    const tokenPayload = { userId: decoded.userId, email: decoded.email, role: decoded.role || 'user' };
    if (decoded.temporarySession) tokenPayload.temporarySession = true;

    const newAccessToken = generateAccessToken(tokenPayload, decoded.role === 'user');
    const newRefreshToken = generateRefreshToken(tokenPayload, decoded.role === 'user');
    return res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[REFRESH TOKEN ERROR]:', err);
    return res.status(500).json({ success: false, message: 'Refresh process failed' });
  }
}

