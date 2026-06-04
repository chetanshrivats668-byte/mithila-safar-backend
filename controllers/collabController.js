import crypto from 'crypto';
import { generateToken } from '../middleware/auth.js';
import { sanitizeInput, validateCollaboratorRegistration } from '../middleware/validator.js';
import * as collabService from '../services/collabService.js';

export async function registerCollaborator(req, res) {
  try {
    const data = sanitizeInput(req.body);
    console.log('[Register] Incoming sanitized data keys:', Object.keys(data));
    console.log('[Register] serviceCategories typeof:', Array.isArray(data.serviceCategories) ? 'array' : typeof data.serviceCategories, JSON.stringify(data.serviceCategories));
    const errors = validateCollaboratorRegistration(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const existingEmail = await collabService.getCollaboratorByEmail(req.app.locals.db, data.email);
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const existingPhone = await collabService.getCollaboratorByPhone(req.app.locals.db, data.phone);
    if (existingPhone) {
      return res.status(409).json({ success: false, message: 'Phone number already registered' });
    }

    const hashedPassword = crypto.createHash('sha256').update(data.password).digest('hex');

    const collab = await collabService.createCollaborator(req.app.locals.db, {
      ...data,
      password: hashedPassword
    });

    const token = generateToken({
      collaboratorId: collab.id,
      email: collab.email,
      name: collab.name,
      collaborator: true,
      serviceCategories: collab.serviceCategories || []
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Awaiting admin approval.',
      token,
      collaborator: {
        id: collab.id,
        name: collab.name,
        email: collab.email,
        phone: collab.phone,
        city: collab.city,
        businessName: collab.businessName,
        serviceCategories: collab.serviceCategories,
        upiId: collab.upiId,
        description: collab.description,
        status: collab.status,
        verification_status: collab.verification_status
      }
    });
  } catch (e) {
    console.error('Collaborator registration error:', e);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
}

export async function loginCollaborator(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const collab = await collabService.getCollaboratorByEmail(req.app.locals.db, email);
    if (!collab) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (collab.verification_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support for assistance.' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    if (collab.password !== hashedPassword) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const key = `login:${email}`;
      otpStore.set(key, {
        otp,
        collabId: collab.id,
        expires: Date.now() + 5 * 60 * 1000
      });

      console.log(`Login OTP for ${email}: ${otp}`);

      return res.status(401).json({
        success: false,
        otpRequired: true,
        email: email,
        message: 'Wrong password. A verification code has been sent to your email.'
      });
    }

    const token = generateToken({
      collaboratorId: collab.id,
      email: collab.email,
      name: collab.name,
      collaborator: true,
      serviceCategories: collab.serviceCategories || []
    });

    res.json({
      success: true,
      token,
      collaborator: {
        id: collab.id,
        name: collab.name,
        email: collab.email,
        phone: collab.phone,
        city: collab.city,
        businessName: collab.businessName,
        serviceCategories: collab.serviceCategories,
        upiId: collab.upiId,
        description: collab.description,
        status: collab.status,
        verification_status: collab.verification_status
      }
    });
  } catch (e) {
    console.error('Collaborator login error:', e);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function loginWithOTP(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🚨 DEV OTP BYPASS — only active when DEV_OTP_BYPASS=true
    // ═══════════════════════════════════════════════════════════════
    if (process.env.DEV_OTP_BYPASS === 'true' && otp === '112233') {
      console.warn('🚨 DEV BYPASS: OTP 112233 accepted for login', email);
      const collab = await collabService.getCollaboratorByEmail(req.app.locals.db, email);
      if (!collab) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      const token = generateToken({
        collaboratorId: collab.id,
        email: collab.email,
        name: collab.name,
        collaborator: true,
        serviceCategories: collab.serviceCategories || []
      });
      return res.json({
        success: true,
        token,
        collaborator: {
          id: collab.id,
          name: collab.name,
          email: collab.email,
          phone: collab.phone,
          city: collab.city,
          businessName: collab.businessName,
          serviceCategories: collab.serviceCategories,
          upiId: collab.upiId,
          description: collab.description,
          status: collab.status,
          verification_status: collab.verification_status
        }
      });
    }
    // ═══════════════════════════════════════════════════════════════

    const key = `login:${email}`;
    const stored = otpStore.get(key);

    if (!stored) {
      return res.status(400).json({ success: false, message: 'OTP not found. Request new OTP.' });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: 'OTP expired. Request new OTP.' });
    }

    if (stored.otp !== otp) {
      return res.status(401).json({ success: false, message: 'Invalid OTP' });
    }

    otpStore.delete(key);

    const collab = await collabService.getCollaboratorById(req.app.locals.db, stored.collabId);
    if (!collab) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const token = generateToken({
      collaboratorId: collab.id,
      email: collab.email,
      name: collab.name,
      collaborator: true,
      serviceCategories: collab.serviceCategories || []
    });

    res.json({
      success: true,
      token,
      collaborator: {
        id: collab.id,
        name: collab.name,
        email: collab.email,
        businessName: collab.businessName,
        status: collab.status,
        verification_status: collab.verification_status,
        serviceCategories: collab.serviceCategories
      }
    });
  } catch (e) {
    console.error('Login with OTP error:', e);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function loginWithPhoneOTP(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP required' });
    }

    const key = phone;
    const stored = otpStore.get(key);

    if (!stored) {
      return res.status(400).json({ success: false, message: 'OTP not found. Request new OTP.' });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: 'OTP expired. Request new OTP.' });
    }

    if (stored.otp !== otp) {
      if (process.env.DEV_OTP_BYPASS === 'true' && otp === '112233') {
        console.warn('🚨 DEV BYPASS: OTP 112233 accepted for phone login', phone);
      } else {
        return res.status(401).json({ success: false, message: 'Invalid OTP' });
      }
    }

    otpStore.delete(key);

    const collab = await collabService.getCollaboratorByPhone(req.app.locals.db, phone);
    if (!collab) {
      return res.status(401).json({ success: false, message: 'No account found with this phone number' });
    }

    const token = generateToken({
      collaboratorId: collab.id,
      email: collab.email,
      name: collab.name,
      collaborator: true,
      serviceCategories: collab.serviceCategories || []
    });

    res.json({
      success: true,
      token,
      collaborator: {
        id: collab.id,
        name: collab.name,
        email: collab.email,
        phone: collab.phone,
        businessName: collab.businessName,
        status: collab.status,
        verification_status: collab.verification_status,
        serviceCategories: collab.serviceCategories
      }
    });
  } catch (e) {
    console.error('Login with phone OTP error:', e);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function getProfile(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
    if (!collab) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    const { password, ...safeData } = collab;
    res.json({ success: true, profile: safeData });
  } catch (e) {
    console.error('Get profile error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
}

export async function updateProfile(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const updates = sanitizeInput(req.body);
    delete updates.password;
    delete updates.email;
    delete updates.status;
    delete updates.verification_status;

    const updated = await collabService.updateCollaborator(req.app.locals.db, collabId, updates);
    res.json({ success: true, message: 'Profile updated', profile: updated });
  } catch (e) {
    console.error('Update profile error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function getListings(req, res) {
  try {
    const { type } = req.params;
    const collabs = await collabService.getApprovedCollaboratorsByType(req.app.locals.db, type);
    const safeListings = collabs.map(c => {
      const { password, bankDetails, documents, ...safe } = c;
      return safe;
    });
    res.json({ success: true, listings: safeListings });
  } catch (e) {
    console.error('Get listings error:', e);
    res.json({ success: true, listings: [] });
  }
}

const otpStore = new Map();

export async function sendOTP(req, res) {
  try {
    const { phone, email } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ success: false, message: 'Phone or email required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = phone || email;
    
    otpStore.set(key, {
      otp: otp,
      expires: Date.now() + 5 * 60 * 1000
    });

    console.log(`OTP for ${key}: ${otp}`);

    if (phone) {
      // ═══════════════════════════════════════════════════════════════
      // 🚨 DEV OTP BYPASS — catch SMS failure gracefully
      // ═══════════════════════════════════════════════════════════════
      try {
        const { sendSMS } = await import('../services/smsService.js');
        await sendSMS(phone, `Your Yatri Point verification code is: ${otp}. Valid for 5 minutes.`);
      } catch (smsErr) {
        if (process.env.DEV_OTP_BYPASS === 'true') {
          console.warn('🚨 DEV BYPASS: SMS send failed but bypass active. OTP for', phone, ':', otp);
        } else {
          throw smsErr;
        }
      }
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (e) {
    console.error('Send OTP error:', e);
    // ═══════════════════════════════════════════════════════════════
    // 🚨 DEV OTP BYPASS — only active when DEV_OTP_BYPASS=true
    // ═══════════════════════════════════════════════════════════════
    if (process.env.DEV_OTP_BYPASS === 'true') {
      console.warn('🚨 DEV BYPASS: Send OTP failed but bypass active.');
      return res.json({ success: true, message: 'DEV: OTP bypass active.' });
    }
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
}

export async function verifyOTP(req, res) {
  try {
    const { phone, email, otp } = req.body;
    
    if (!otp) {
      return res.status(400).json({ success: false, message: 'OTP required' });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🚨 DEV OTP BYPASS — only active when DEV_OTP_BYPASS=true
    // ═══════════════════════════════════════════════════════════════
    if (process.env.DEV_OTP_BYPASS === 'true' && otp === '112233') {
      console.warn('🚨 DEV BYPASS: OTP 112233 accepted for', phone || email);
      return res.json({ success: true, message: 'Phone verified successfully' });
    }
    // ═══════════════════════════════════════════════════════════════

    const key = phone || email;
    const stored = otpStore.get(key);

    if (!stored) {
      return res.status(400).json({ success: false, message: 'OTP not found. Request new OTP.' });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(key);
      return res.status(400).json({ success: false, message: 'OTP expired. Request new OTP.' });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    otpStore.delete(key);
    res.json({ success: true, message: 'Phone verified successfully' });
  } catch (e) {
    console.error('Verify OTP error:', e);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
}
