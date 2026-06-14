import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import { sanitizeInput, validateCollaboratorRegistration } from '../middleware/validator.js';
import * as collabService from '../services/collabService.js';
import { verifyMsg91Token } from './auth/authController.js';
import redisClient from '../utils/redisClient.js';

function isCollaboratorApproved(collab) {
  const verificationStatus = collab?.verification_status || collab?.verificationStatus || '';
  const status = collab?.status || '';
  return verificationStatus === 'verified' || status === 'approved' || status === 'active';
}

function buildCollaboratorSessionPayload(collab) {
  return {
    collaboratorId: collab.id,
    userId: collab.userId || null,
    email: collab.email,
    name: collab.name,
    collaborator: true,
    type: (collab.type || (Array.isArray(collab.serviceCategories) ? collab.serviceCategories[0] : collab.serviceCategories) || 'business'),
    serviceCategories: collab.serviceCategories || [],
    permissions: collab.serviceCategories || []
  };
}

function serializeCollaborator(collab) {
  return {
    id: collab.id,
    userId: collab.userId || null,
    name: collab.name,
    email: collab.email,
    phone: collab.phone,
    city: collab.city,
    state: collab.state,
    businessName: collab.businessName,
    type: (collab.type || (Array.isArray(collab.serviceCategories) ? collab.serviceCategories[0] : collab.serviceCategories) || 'business'),
    serviceCategories: collab.serviceCategories || [],
    upiId: collab.upiId,
    description: collab.description || collab.businessDescription || '',
    status: collab.status,
    verification_status: collab.verification_status,
    partnerCollabStatus: collab.partnerCollabStatus || 'pending',
    submittedFrom: collab.submittedFrom || null,
    approvedAt: collab.approvedAt || null,
    approvedBy: collab.approvedBy || null,
    permissions: collab.serviceCategories || []
  };
}

function getReapplyAfterDate() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function isPartnerCollabApprovedForAccount(collab, accountId) {
  return Boolean(
    collab &&
    accountId &&
    collab.submittedFrom === accountId &&
    collab.partnerCollabStatus === 'approved' &&
    collab.verification_status !== 'suspended'
  );
}

function isPartnerCollabRejectedAndCoolingDown(collab) {
  return Boolean(
    collab?.partnerCollabStatus === 'rejected' &&
    collab?.partnerCollabReapplyAfter &&
    new Date(collab.partnerCollabReapplyAfter).getTime() > Date.now()
  );
}

function buildCollaboratorSessionResponse(collab, token) {
  return {
    success: true,
    token,
    collaborator: serializeCollaborator(collab)
  };
}

function isLegacySha256Hash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return { valid: false, upgradedHash: null };
  }

  if (storedHash.startsWith('$2')) {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, upgradedHash: null };
  }

  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  if (isLegacySha256Hash(storedHash) && storedHash === legacyHash) {
    return { valid: true, upgradedHash: await hashPassword(password) };
  }

  return { valid: false, upgradedHash: null };
}

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
      const message = isCollaboratorApproved(existingEmail)
        ? 'This collaborator account is already approved. Please log in with your email and password.'
        : 'You already have a pending collaborator application. Please wait for admin review.';
      return res.status(409).json({ success: false, message });
    }

    const existingPhone = await collabService.getCollaboratorByPhone(req.app.locals.db, data.phone);
    if (existingPhone) {
      const message = isCollaboratorApproved(existingPhone)
        ? 'This collaborator account is already approved. Please log in with your email and password.'
        : 'You already have a pending collaborator application. Please wait for admin review.';
      return res.status(409).json({ success: false, message });
    }

    const hashedPassword = await hashPassword(data.password);
    const collab = await collabService.createCollaborator(req.app.locals.db, {
      ...data,
      password: hashedPassword
    });

    const token = generateToken(buildCollaboratorSessionPayload(collab));
    return res.status(201).json({
      success: true,
      message: 'Registration successful. Awaiting admin approval.',
      token,
      collaborator: serializeCollaborator(collab)
    });
  } catch (e) {
    console.error('Collaborator registration error:', e);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
}

export async function loginCollaborator(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const identifier = email.trim();
    let collab;
    if (identifier.includes('@')) {
      collab = await collabService.getCollaboratorByEmail(req.app.locals.db, identifier);
    } else {
      collab = await collabService.getCollaboratorByPhone(req.app.locals.db, identifier);
    }

    if (!collab) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (collab.verification_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support for assistance.' });
    }

    if (!isCollaboratorApproved(collab)) {
      return res.status(403).json({
        success: false,
        message: 'Your collaborator account is pending admin approval. Please wait for approval before logging in.'
      });
    }

    const passwordCheck = await verifyPassword(password, collab.password);
    if (!passwordCheck.valid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (passwordCheck.upgradedHash) {
      try {
        await collabService.updateCollaborator(req.app.locals.db, collab.id, {
          password: passwordCheck.upgradedHash
        });
        collab.password = passwordCheck.upgradedHash;
      } catch (upgradeErr) {
        console.warn('Collaborator password hash upgrade failed:', upgradeErr);
      }
    }

    const token = generateToken(buildCollaboratorSessionPayload(collab));
    return res.json(buildCollaboratorSessionResponse(collab, token));
  } catch (e) {
    console.error('Collaborator login error:', e);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function loginWithOTP(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP required' });
    }

    const key = `login:${email}`;
    const storedStr = await redisClient.get(key);

    if (!storedStr) {
      return res.status(400).json({ success: false, message: 'OTP not found. Request new OTP.' });
    }

    const stored = JSON.parse(storedStr);

    const expiresAtMs = typeof stored.expires === 'string' ? new Date(stored.expires).getTime() : stored.expires;
    if (Date.now() > expiresAtMs) {
      await redisClient.del(key);
      return res.status(400).json({ success: false, message: 'OTP expired. Request new OTP.' });
    }

    const attemptCount = Number(stored.attempts || 0);
    if (attemptCount >= 5) {
      await redisClient.del(key);
      return res.status(429).json({ success: false, message: 'Too many OTP attempts. Request a new OTP.' });
    }

    if (stored.otp !== otp) {
      const nextAttempts = attemptCount + 1;
      await redisClient.set(key, JSON.stringify({
        ...stored,
        attempts: nextAttempts
      }));
      if (nextAttempts >= 5) {
        await redisClient.del(key);
        return res.status(429).json({ success: false, message: 'Too many OTP attempts. Request a new OTP.' });
      }
      return res.status(401).json({ success: false, message: `Invalid OTP. ${5 - nextAttempts} attempt(s) remaining.` });
    }

    await redisClient.del(key);

    const collab = await collabService.getCollaboratorById(req.app.locals.db, stored.collabId);
    if (!collab) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const token = generateToken(buildCollaboratorSessionPayload(collab));
    return res.json(buildCollaboratorSessionResponse(collab, token));
  } catch (e) {
    console.error('Login with OTP error:', e);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function loginWithPhone(req, res) {
  try {
    const { phone, token } = req.body;
    if (!phone || !token) {
      return res.status(400).json({ success: false, message: 'Phone and verification token are required' });
    }

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const normalizedPhone = `+91${cleanPhone}`;

    const verificationReq = {
      body: { phone: normalizedPhone, token }
    };

    let verificationPassed = false;
    const verificationRes = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        verificationPassed = Boolean(payload?.success);
        return payload;
      }
    };

    await verifyMsg91Token(verificationReq, verificationRes);

    if (!verificationPassed) {
      return res.status(400).json({ success: false, message: 'Phone verification failed' });
    }

    const collab = await collabService.getCollaboratorByPhone(req.app.locals.db, cleanPhone);
    if (!collab) {
      return res.status(401).json({ success: false, message: 'No collaborator account found with this phone number' });
    }

    if (collab.verification_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support for assistance.' });
    }

    if (!isCollaboratorApproved(collab)) {
      return res.status(403).json({
        success: false,
        message: 'Your collaborator account is pending admin approval.'
      });
    }

    const jwtToken = generateToken(buildCollaboratorSessionPayload(collab));
    return res.json(buildCollaboratorSessionResponse(collab, jwtToken));
  } catch (e) {
    console.error('Login with phone error:', e);
    return res.status(500).json({ success: false, message: 'Login failed: ' + e.message });
  }
}

export async function submitPartnerCollab(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authenticated account is required' });
    }

    const data = sanitizeInput(req.body || {});
    const db = req.app.locals.db;
    const user = await req.app.locals.db.get('users', userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found' });
    }

    const submittedFrom = userId;
    const userEmail = user.email || '';
    const userPhone = user.phone || '';

    let collab =
      await collabService.getCollaboratorByEmail(db, userEmail) ||
      await collabService.getCollaboratorByPhone(db, userPhone);

    if (collab?.verification_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Suspended collaborators cannot submit partner collaboration applications.' });
    }

    if (collab && isPartnerCollabRejectedAndCoolingDown(collab)) {
      return res.status(429).json({
        success: false,
        message: 'Your previous partner collaboration application was rejected. Please wait before reapplying.',
        reapplyAfter: collab.partnerCollabReapplyAfter
      });
    }

    const updates = {
      userId,
      submittedFrom,
      partnerCollabStatus: 'pending',
      approvedAt: null,
      approvedBy: null,
      partnerCollabRejectedAt: null,
      partnerCollabReapplyAfter: null
    };

    if (data.name) updates.name = data.name;
    if (userEmail) updates.email = userEmail;
    if (userPhone) updates.phone = userPhone;
    if (data.phone) updates.phone = data.phone;
    if (data.businessName) updates.businessName = data.businessName;
    if (data.businessType) updates.businessType = data.businessType;
    if (data.businessDescription || data.description) updates.businessDescription = data.businessDescription || data.description;
    if (data.address) updates.address = data.address;
    if (data.city) updates.city = data.city;
    if (data.state) updates.state = data.state;
    if (data.landmark) updates.landmark = data.landmark;
    if (data.pinCode) updates.pinCode = data.pinCode;
    if (data.operatingCity) updates.operatingCity = data.operatingCity;
    if (Array.isArray(data.routeCities)) updates.routeCities = data.routeCities;
    if (Array.isArray(data.serviceCategories)) updates.serviceCategories = data.serviceCategories;
    if (data.documents) updates.documents = data.documents;
    if (data.bankDetails) updates.bankDetails = data.bankDetails;
    if (data.aadhaarUrl) updates.aadhaarUrl = data.aadhaarUrl;
    if (data.panUrl) updates.panUrl = data.panUrl;
    if (data.aadhaarId) updates.aadhaarId = data.aadhaarId;
    if (data.yearsOfExperience) updates.yearsOfExperience = data.yearsOfExperience;

    if (collab) {
      await collabService.updateCollaborator(db, collab.id, updates);
      collab = await collabService.getCollaboratorById(db, collab.id);
    } else {
      collab = await collabService.createCollaborator(db, {
        ...updates,
        name: updates.name || user.name || userEmail.split('@')[0] || 'Collaborator',
        email: updates.email || userEmail,
        phone: updates.phone || userPhone,
        password: crypto.randomBytes(16).toString('hex'),
        verificationStatus: 'pending',
        status: 'pending'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Partner collaboration application submitted successfully and is pending admin review.',
      collaborator: serializeCollaborator(collab)
    });
  } catch (e) {
    console.error('Submit partner collab error:', e);
    return res.status(500).json({ success: false, message: 'Failed to submit partner collaboration application' });
  }
}

export async function getMyCollaboratorRoles(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Authenticated user id is required' });
    }

    const collaborators = await collabService.getCollaboratorsByUserId(req.app.locals.db, userId);
    const roles = collaborators.filter(collab => isCollaboratorApproved(collab)).map(collab => ({
      id: collab.id,
      userId: collab.userId || null,
      type: (collab.serviceCategories || [])[0] || 'business',
      serviceCategories: collab.serviceCategories || [],
      verification_status: collab.verification_status || 'pending',
      businessName: collab.businessName || '',
      name: collab.name || '',
      email: collab.email || '',
      permissions: collab.serviceCategories || []
    }));

    return res.json({
      success: true,
      roles,
      defaultRole: roles.find(r => r.verification_status === 'verified')?.type || roles[0]?.type || null
    });
  } catch (e) {
    console.error('Get my collaborator roles error:', e);
    return res.status(500).json({ success: false, message: 'Failed to load collaborator roles' });
  }
}

export async function selectCollaboratorRole(req, res) {
  try {
    const userId = req.user?.userId;
    const { collaboratorId } = req.body || {};
    if (!userId || !collaboratorId) {
      return res.status(400).json({ success: false, message: 'userId and collaboratorId are required' });
    }

    const collab = await collabService.getCollaboratorById(req.app.locals.db, collaboratorId);
    if (!collab) {
      return res.status(403).json({ success: false, message: 'This collaborator profile is not linked to your account' });
    }

    const user = await req.app.locals.db.get('users', userId);
    const userEmail = user?.email;
    const userPhone = user?.phone;
    const cleanUserPhone = userPhone ? userPhone.replace(/\D/g, '').slice(-10) : '';
    const cleanCollabPhone = collab.phone ? collab.phone.replace(/\D/g, '').slice(-10) : '';

    const isOwner = collab.userId === userId ||
                    (userEmail && collab.email === userEmail) ||
                    (cleanUserPhone && cleanCollabPhone === cleanUserPhone);

    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'This collaborator profile is not linked to your account' });
    }

    if (collab.verification_status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This collaborator profile is suspended' });
    }

    if (!isCollaboratorApproved(collab)) {
      return res.status(403).json({ success: false, message: 'This collaborator profile is still awaiting admin approval' });
    }

    if (!collab.userId) {
      await collabService.updateCollaborator(req.app.locals.db, collaboratorId, { userId });
      collab.userId = userId;
    }

    const token = generateToken(buildCollaboratorSessionPayload(collab));
    return res.json(buildCollaboratorSessionResponse(collab, token));
  } catch (e) {
    console.error('Select collaborator role error:', e);
    return res.status(500).json({ success: false, message: 'Failed to activate collaborator role' });
  }
}

export async function validateToken(req, res) {
  try {
    // Token is already validated by middleware
    const collabId = req.collaborator.collaboratorId;
    const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
    if (!collab) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    
    // Check if account is suspended
    if (collab.verification_status === 'suspended') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account suspended. Please contact support.' 
      });
    }

    if (!isCollaboratorApproved(collab)) {
      return res.status(403).json({
        success: false,
        message: 'Collaborator account is awaiting admin approval.'
      });
    }
    
    return res.json({ 
      success: true, 
      valid: true,
      collaborator: serializeCollaborator(collab)
    });
  } catch (e) {
    console.error('Validate token error:', e);
    return res.status(500).json({ success: false, message: 'Token validation failed' });
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

