import { get as dbGet, create as dbCreate, update as dbUpdate, remove as dbRemove } from '../db.js';
import crypto from 'crypto';
import { trackEmailOtpVerification, trackEmailSend } from './performanceMonitor.js';
import redisClient from '../redisClient.js';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 minute cooldown between resends
const MAX_ATTEMPTS = 3; // Brute force prevention limit

/**
 * Generates a secure 6-digit numeric OTP code
 * @returns {string} 6-digit numeric string
 */
export function generateOTPCode() {
  return Math.floor(100000 + crypto.randomInt(900000)).toString();
}

/**
 * Saves a generated OTP to the database (with Redis fast-path)
 * @param {Object} db - Supabase DB reference
 * @param {string} email - User email address
 * @param {string} otpCode - Generated 6-digit OTP code
 */
export async function saveEmailOTP(db, email, otpCode) {
  const startTime = Date.now();
  const normalizedEmail = email.toLowerCase().trim();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  const otpData = {
    email: normalizedEmail,
    otpCode,
    expiresAt,
    attemptsCount: 0,
    createdAt: new Date().toISOString()
  };

  // Always keep Redis memory store updated as the immediate local cache
  try {
    await redisClient.set(`otp:email:${normalizedEmail}`, JSON.stringify(otpData), 'PX', OTP_EXPIRY_MS);
  } catch (err) {
    console.warn(`[OTP HELPER] Redis set failed for email OTP: ${err.message}`);
  }

  if (db) {
    try {
      await dbCreate('email_otps', normalizedEmail, otpData);
      console.log(`💾 [OTP HELPER]: OTP stored in Supabase for ${normalizedEmail}`);
      const duration = Date.now() - startTime;
      trackEmailSend(duration, true); // Success
      return;
    } catch (err) {
      console.warn(`[OTP HELPER]: Supabase write failed for ${normalizedEmail}.`, err.message);
      const duration = Date.now() - startTime;
      trackEmailSend(duration, false); // Failure
    }
  } else {
    console.log(`💾 [OTP HELPER]: Database uninitialized. OTP stored in Redis only for ${normalizedEmail}`);
    const duration = Date.now() - startTime;
    trackEmailSend(duration, true);
  }
}

/**
 * Checks if a user is within the resend rate limit window
 * @param {Object} db - Supabase DB reference
 * @param {string} email - User email address
 * @returns {Promise<boolean>} True if rate-limited (must wait), false if allowed to send
 */
export async function checkOTPRequestRateLimit(db, email) {
  const normalizedEmail = email.toLowerCase().trim();

  // Fast path: Check Redis cache first
  try {
    const cachedStr = await redisClient.get(`otp:email:${normalizedEmail}`);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      const elapsed = Date.now() - new Date(cached.createdAt).getTime();
      if (elapsed < OTP_RATE_LIMIT_MS) {
        return true; // Rate-limited in cache
      }
    }
  } catch (err) {
    console.warn(`[OTP HELPER] Redis read rate limit failed: ${err.message}`);
  }

  // Check database if cache expired
  if (db) {
    try {
      const data = await dbGet('email_otps', normalizedEmail);
      if (data) {
        const elapsed = Date.now() - new Date(data.createdAt).getTime();
        if (elapsed < OTP_RATE_LIMIT_MS) {
          return true; // Rate-limited in database
        }
        // Repopulate cache
        const remainingTtl = new Date(data.expiresAt).getTime() - Date.now();
        if (remainingTtl > 0) {
          await redisClient.set(`otp:email:${normalizedEmail}`, JSON.stringify(data), 'PX', remainingTtl);
        }
      }
    } catch (err) {
      console.warn('[OTP HELPER]: Database rate-limit check failed.', err.message);
    }
  }

  return false;
}

/**
 * Verifies an OTP code and implements expiry & brute-force limits
 * @param {Object} db - Supabase DB reference
 * @param {string} email - User email address
 * @param {string} otpCode - User entered OTP code
 * @returns {Promise<Object>} Verification status object
 */
export async function verifyEmailOTP(db, email, otpCode) {
  const startTime = Date.now();
  const normalizedEmail = email.toLowerCase().trim();
  const cleanedOtp = otpCode.toString().trim();

  // Fast path: Check Redis first
  try {
    const cachedStr = await redisClient.get(`otp:email:${normalizedEmail}`);
    if (cachedStr) {
      const result = await verifyFromSharedCache(db, normalizedEmail, cleanedOtp, JSON.parse(cachedStr), 'email');
      const duration = Date.now() - startTime;
      trackEmailOtpVerification(duration, true); // Cache hit
      return result;
    }
  } catch (err) {
    console.warn(`[OTP HELPER] Redis read during verify failed: ${err.message}`);
  }

  // Slow path: Check database
  let data = null;

  if (db) {
    try {
      const result = await dbGet('email_otps', normalizedEmail);
      if (result) {
        data = result;
        // Cache the database result
        const remainingTtl = new Date(data.expiresAt).getTime() - Date.now();
        if (remainingTtl > 0) {
          await redisClient.set(`otp:email:${normalizedEmail}`, JSON.stringify(data), 'PX', remainingTtl);
        }
      }
    } catch (err) {
      console.warn('[OTP HELPER]: Database OTP read failed.', err.message);
    }
  }

  // If no OTP found anywhere
  if (!data) {
    const duration = Date.now() - startTime;
    trackEmailOtpVerification(duration, false); // Cache miss
    return {
      success: false,
      message: 'No verification code found or session expired. Please request a new code.'
    };
  }

  const result = await verifyFromSharedCache(db, normalizedEmail, cleanedOtp, data, 'email');
  const duration = Date.now() - startTime;
  trackEmailOtpVerification(duration, false); // Cache miss
  return result;
}

/**
 * Helper function to verify OTP from Redis or database data
 */
async function verifyFromSharedCache(db, key, cleanedOtp, data, type) {
  const cacheKey = `otp:${type}:${key}`;
  const dbTable = type === 'email' ? 'email_otps' : 'phone_otps';
  const maxAttempts = type === 'email' ? MAX_ATTEMPTS : PHONE_MAX_ATTEMPTS;

  const expiresAtMs = typeof data.expiresAt === 'string' ? new Date(data.expiresAt).getTime() : data.expiresAt;

  // Expiry check
  if (Date.now() > expiresAtMs) {
    await redisClient.del(cacheKey).catch(() => {});
    if (db) {
      try { await dbRemove(dbTable, key); } catch (e) {}
    }
    return {
      success: false,
      message: 'Verification code has expired. Please request a new code.'
    };
  }

  // Brute-force protection check
  if (data.attemptsCount >= maxAttempts) {
    await redisClient.del(cacheKey).catch(() => {});
    if (db) {
      try { await dbRemove(dbTable, key); } catch (e) {}
    }
    return {
      success: false,
      message: 'Too many incorrect attempts. Please request a new verification code.'
    };
  }

  // Check code match
  if (data.otpCode !== cleanedOtp) {
    const newAttempts = (data.attemptsCount || 0) + 1;
    
    // Update Redis cache immediately
    data.attemptsCount = newAttempts;
    const remainingTtl = expiresAtMs - Date.now();
    if (remainingTtl > 0) {
      await redisClient.set(cacheKey, JSON.stringify(data), 'PX', remainingTtl).catch(() => {});
    }

    // Update database asynchronously (fire-and-forget)
    if (db) {
      dbUpdate(dbTable, key, { attemptsCount: newAttempts })
        .catch(updateErr => {
          console.warn(`[OTP HELPER]: Failed to update attempt count in database: ${updateErr.message}`);
        });
    }

    if (newAttempts >= maxAttempts) {
      await redisClient.del(cacheKey).catch(() => {});
      if (db) {
        try { await dbRemove(dbTable, key); } catch (e) {}
      }
      return {
        success: false,
        message: 'Too many incorrect attempts. This code is now invalidated. Please request a new one.'
      };
    } else {
      const remaining = maxAttempts - newAttempts;
      return {
        success: false,
        message: `Incorrect verification code. ${remaining} attempt(s) remaining.`
      };
    }
  }

  // Success: delete document immediately to prevent replay attacks
  await redisClient.del(cacheKey).catch(() => {});
  if (db) {
    try { 
      await dbRemove(dbTable, key);
    } catch (deleteErr) {
      console.warn(`[OTP HELPER]: Failed to clean up OTP in database after success: ${deleteErr.message}`);
    }
  }

  return { success: true };
}

// ============================================================
// PHONE OTP HELPERS (India - +91)
// ============================================================
const PHONE_OTP_EXPIRY_MS = 5 * 60 * 1000;
const PHONE_OTP_RATE_LIMIT_MS = 60 * 1000;
const PHONE_MAX_ATTEMPTS = 3;

function normalizePhone(phone) {
  const cleaned = phone.replace(/\D/g, '').slice(-10);
  return cleaned.length === 10 ? `+91${cleaned}` : null;
}

export async function savePhoneOTP(db, phone, otpCode) {
  const startTime = Date.now();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw new Error('Invalid phone number format');

  const expiresAt = Date.now() + PHONE_OTP_EXPIRY_MS;
  const otpData = {
    phone: normalizedPhone,
    otpCode,
    expiresAt,
    attemptsCount: 0,
    createdAt: new Date().toISOString()
  };

  try {
    await redisClient.set(`otp:phone:${normalizedPhone}`, JSON.stringify(otpData), 'PX', PHONE_OTP_EXPIRY_MS);
  } catch (err) {
    console.warn(`[PHONE OTP] Redis set failed: ${err.message}`);
  }

  if (db) {
    try {
      await dbCreate('phone_otps', normalizedPhone, otpData);
      console.log(`💾 [PHONE OTP]: OTP stored in Supabase for ${normalizedPhone}`);
      return;
    } catch (err) {
      console.warn(`[PHONE OTP]: Supabase write failed.`, err.message);
    }
  } else {
    console.log(`💾 [PHONE OTP]: Database uninitialized. OTP stored in Redis only for ${normalizedPhone}`);
  }
}

export async function checkPhoneOTPRateLimit(db, phone) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;

  try {
    const cachedStr = await redisClient.get(`otp:phone:${normalizedPhone}`);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      const elapsed = Date.now() - new Date(cached.createdAt).getTime();
      if (elapsed < PHONE_OTP_RATE_LIMIT_MS) return true;
    }
  } catch (err) {
    console.warn(`[PHONE OTP] Redis rate limit check failed: ${err.message}`);
  }

  if (db) {
    try {
      const data = await dbGet('phone_otps', normalizedPhone);
      if (data) {
        const elapsed = Date.now() - new Date(data.createdAt).getTime();
        if (elapsed < PHONE_OTP_RATE_LIMIT_MS) return true;
        
        const remainingTtl = new Date(data.expiresAt).getTime() - Date.now();
        if (remainingTtl > 0) {
          await redisClient.set(`otp:phone:${normalizedPhone}`, JSON.stringify(data), 'PX', remainingTtl);
        }
      }
    } catch (err) {
      console.warn('[PHONE OTP]: Database rate-limit check failed.', err.message);
    }
  }
  return false;
}

export async function verifyPhoneOTP(db, phone, otpCode) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return { success: false, message: 'Invalid phone number format' };
  const cleanedOtp = otpCode.toString().trim();

  try {
    const cachedStr = await redisClient.get(`otp:phone:${normalizedPhone}`);
    if (cachedStr) {
      return await verifyFromSharedCache(db, normalizedPhone, cleanedOtp, JSON.parse(cachedStr), 'phone');
    }
  } catch (err) {
    console.warn(`[PHONE OTP] Redis verify read failed: ${err.message}`);
  }

  let data = null;
  if (db) {
    try {
      const result = await dbGet('phone_otps', normalizedPhone);
      if (result) {
        data = result;
        const remainingTtl = new Date(data.expiresAt).getTime() - Date.now();
        if (remainingTtl > 0) {
          await redisClient.set(`otp:phone:${normalizedPhone}`, JSON.stringify(data), 'PX', remainingTtl);
        }
      }
    } catch (err) {
      console.warn('[PHONE OTP]: Database OTP read failed.', err.message);
    }
  }

  if (!data) {
    return {
      success: false,
      message: 'No verification code found or session expired. Please request a new code.'
    };
  }

  return await verifyFromSharedCache(db, normalizedPhone, cleanedOtp, data, 'phone');
}
