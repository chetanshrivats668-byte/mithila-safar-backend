import { get as dbGet, create as dbCreate, update as dbUpdate, remove as dbRemove } from '../db.js';
import crypto from 'crypto';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 minute cooldown between resends
const MAX_ATTEMPTS = 3; // Brute force prevention limit

// Thread-safe in-memory fallback store when Firestore is uninitialized or throws errors
const inMemoryOtpStore = new Map();

/**
 * Generates a secure 6-digit numeric OTP code
 * @returns {string} 6-digit numeric string
 */
export function generateOTPCode() {
  return Math.floor(100000 + crypto.randomInt(900000)).toString();
}

/**
 * Saves a generated OTP to the database (Firestore with In-Memory fallback)
 * @param {Object} db - Firestore DB reference (can be null/undefined)
 * @param {string} email - User email address
 * @param {string} otpCode - Generated 6-digit OTP code
 */
export async function saveEmailOTP(db, email, otpCode) {
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  const otpData = {
    email: normalizedEmail,
    otpCode,
    expiresAt,
    attemptsCount: 0,
    createdAt: new Date().toISOString()
  };

  // Always keep in-memory store updated as an immediate local cache/fallback
  inMemoryOtpStore.set(normalizedEmail, otpData);

  if (db) {
    try {
      await dbCreate('email_otps', normalizedEmail, otpData);
      console.log(`💾 [OTP HELPER]: OTP stored in Supabase for ${normalizedEmail}`);
      return;
    } catch (err) {
      console.warn(`[OTP HELPER]: Supabase write failed for ${normalizedEmail}. Falling back to In-Memory store. Error:`, err.message);
    }
  } else {
    console.log(`💾 [OTP HELPER]: Database uninitialized. OTP stored In-Memory for ${normalizedEmail}`);
  }
}

/**
 * Checks if a user is within the resend rate limit window (Firestore with In-Memory fallback)
 * @param {Object} db - Firestore DB reference (can be null/undefined)
 * @param {string} email - User email address
 * @returns {Promise<boolean>} True if rate-limited (must wait), false if allowed to send
 */
export async function checkOTPRequestRateLimit(db, email) {
  const normalizedEmail = email.toLowerCase().trim();

  // First check in-memory cache for immediate response
  const cached = inMemoryOtpStore.get(normalizedEmail);
  if (cached) {
    const elapsed = Date.now() - new Date(cached.createdAt).getTime();
    if (elapsed < OTP_RATE_LIMIT_MS) {
      return true; // Rate-limited in cache
    }
  }

  if (db) {
    try {
      const data = await dbGet('email_otps', normalizedEmail);
      if (data) {
        const elapsed = Date.now() - new Date(data.createdAt).getTime();
        if (elapsed < OTP_RATE_LIMIT_MS) {
          return true; // Rate-limited in database
        }
      }
    } catch (err) {
      console.warn('[OTP HELPER]: Database rate-limit check failed. Relying on In-Memory cache.', err.message);
    }
  }

  return false;
}

/**
 * Verifies an OTP code and implements expiry & brute-force limits (Firestore with In-Memory fallback)
 * @param {Object} db - Firestore DB reference (can be null/undefined)
 * @param {string} email - User email address
 * @param {string} otpCode - User entered OTP code
 * @returns {Promise<Object>} Verification status object
 */
export async function verifyEmailOTP(db, email, otpCode) {
  const normalizedEmail = email.toLowerCase().trim();
  const cleanedOtp = otpCode.toString().trim();

  // Check DEV OTP bypass
  if (process.env.DEV_OTP_BYPASS === 'true' && cleanedOtp === '112233') {
    console.warn(`🚨 [DEV OTP BYPASS] Accepted OTP 112233 for ${normalizedEmail}`);
    // Clear stores upon successful bypass to avoid lingering state
    inMemoryOtpStore.delete(normalizedEmail);
    if (db) {
      try { await dbRemove('email_otps', normalizedEmail); } catch (e) {}
    }
    return { success: true };
  }

  let data = null;
  let source = 'memory';

  // 1. Try to fetch from database if available
  if (db) {
    try {
      const result = await dbGet('email_otps', normalizedEmail);
      if (result) {
        data = result;
        source = 'supabase';
      }
    } catch (err) {
      console.warn('[OTP HELPER]: Database OTP read failed. Checking local memory cache...', err.message);
    }
  }

  // 2. Fall back to local memory store if not found in database or if database failed
  if (!data) {
    data = inMemoryOtpStore.get(normalizedEmail);
    source = 'memory';
  }

  // If no OTP found anywhere
  if (!data) {
    return {
      success: false,
      message: 'No verification code found or session expired. Please request a new code.'
    };
  }

  // Expiry check
  if (Date.now() > data.expiresAt) {
    inMemoryOtpStore.delete(normalizedEmail);
    if (db && source === 'supabase') {
      try { await dbRemove('email_otps', normalizedEmail); } catch (e) {}
    }
    return {
      success: false,
      message: 'Verification code has expired. Please request a new code.'
    };
  }

  // Brute-force protection check
  if (data.attemptsCount >= MAX_ATTEMPTS) {
    inMemoryOtpStore.delete(normalizedEmail);
    if (db && source === 'supabase') {
      try { await dbRemove('email_otps', normalizedEmail); } catch (e) {}
    }
    return {
      success: false,
      message: 'Too many incorrect attempts. Please request a new verification code.'
    };
  }

  // Check code match
  if (data.otpCode !== cleanedOtp) {
    const newAttempts = (data.attemptsCount || 0) + 1;
    
    // Update local cache
    data.attemptsCount = newAttempts;
    inMemoryOtpStore.set(normalizedEmail, data);

    if (newAttempts >= MAX_ATTEMPTS) {
      inMemoryOtpStore.delete(normalizedEmail);
      if (db && source === 'supabase') {
        try { await dbRemove('email_otps', normalizedEmail); } catch (e) {}
      }
      return {
        success: false,
        message: 'Too many incorrect attempts. This code is now invalidated. Please request a new one.'
      };
    } else {
      if (db && source === 'supabase') {
        try {
          await dbUpdate('email_otps', normalizedEmail, { attemptsCount: newAttempts });
        } catch (updateErr) {
          console.warn('[OTP HELPER]: Failed to update attempt count in database:', updateErr.message);
        }
      }
      const remaining = MAX_ATTEMPTS - newAttempts;
      return {
        success: false,
        message: `Incorrect verification code. ${remaining} attempt(s) remaining.`
      };
    }
  }

  // Success: delete document immediately to prevent replay attacks
  inMemoryOtpStore.delete(normalizedEmail);
  if (db && source === 'supabase') {
    try {
      await dbRemove('email_otps', normalizedEmail);
    } catch (deleteErr) {
      console.warn('[OTP HELPER]: Failed to clean up OTP in database after success:', deleteErr.message);
    }
  }

  return { success: true };
}
