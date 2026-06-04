/**
 * smsOtpHelper.js
 * 
 * Persistent SMS OTP storage using Supabase + in-memory fallback.
 * Replaces the in-memory-only otpStore Map in server.js.
 * 
 * Pattern follows utils/otp/otpHelper.js exactly.
 * Supabase table: sms_otps  (id = phone number, 10-digit Indian mobile)
 */

import {
    get as dbGet,
    create as dbCreate,
    update as dbUpdate,
    remove as dbRemove
} from '../db.js';
import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS = 5 * 60 * 1000;        // 5 minutes
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5-minute rate-limit window
const MAX_SEND_COUNT = 3;                    // max 3 OTPs per window
const MAX_ATTEMPTS = 3;                      // max verification attempts

// In-memory fallback (always updated; database is async & may fail)
const inMemorySmsOtpStore = new Map();

// For DEV_OTP_BYPASS: master OTP that always passes (when env var is set)
const DEV_OTP = '112233';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure 6-digit OTP code.
 * Uses crypto.randomInt for proper randomness (NOT Math.random()).
 * @returns {string} 6-digit OTP (100000-999999)
 */
export function generateSmsOTPCode() {
    // crypto.randomInt(900000) → 0..899999, add 100000 → 100000..999999
    return Math.floor(100000 + crypto.randomInt(900000)).toString();
}

/**
 * Check whether DEV_OTP_BYPASS mode is active.
 * Mirrors otpHelper.js / server.js logic.
 */
function isDevBypassEnabled() {
    return process.env.DEV_OTP_BYPASS === 'true';
}

// ─── Save OTP ─────────────────────────────────────────────────────────────────

/**
 * Save an SMS OTP for the given phone number.
 * Writes to BOTH the in-memory Map (always) AND Supabase sms_otps table (if available).
 * On database failure, the in-memory entry is still valid — graceful fallback.
 * 
 * @param {object|null} db  - Supabase client (or null if unavailable)
 * @param {string} phone    - 10-digit normalized phone number (PK)
 * @param {string} otpCode  - 6-digit OTP string
 * @param {number} sendCount - current send-count for rate limiting (default 1)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveSmsOTP(db, phone, otpCode, sendCount = 1) {
    const now = new Date();
    const otpData = {
        id: phone,
        otpCode,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS).toISOString(),
        attemptsCount: 0,
        sendCount,
        createdAt: now.toISOString()
    };

    // Always save to in-memory store (synchronous, guaranteed to work)
    inMemorySmsOtpStore.set(phone, {
        otpCode,
        expiresAt: Date.now() + OTP_EXPIRY_MS,
        attemptsCount: 0,
        sendCount
    });

    // Try saving to Supabase (async, may fail gracefully)
    if (db) {
        try {
            // Upsert: replace if exists, insert if new
            await dbCreate('sms_otps', phone, otpData);
        } catch (err) {
            console.warn('[smsOtpHelper] Supabase save failed, using in-memory fallback:', err.message);
            // Not throwing — in-memory store is our safety net
        }
    }

    return { success: true };
}

// ─── Rate-Limit Check ─────────────────────────────────────────────────────────

/**
 * Check whether the phone has exceeded the OTP send rate limit.
 * SMS rate limit: MAX_SEND_COUNT requests per RATE_LIMIT_WINDOW_MS.
 * 
 * @param {object|null} db - Supabase client
 * @param {string} phone   - 10-digit normalized phone number
 * @returns {Promise<boolean>} true if rate-limited (should NOT send), false if allowed
 */
export async function checkSmsOTPRateLimit(db, phone) {
    // 1. Check in-memory cache first (fast path)
    const memEntry = inMemorySmsOtpStore.get(phone);
    if (memEntry) {
        const memCreated = memEntry.expiresAt - OTP_EXPIRY_MS; // approximate creation time
        const withinWindow = Date.now() - memCreated < RATE_LIMIT_WINDOW_MS;
        if (withinWindow && (memEntry.sendCount || 0) >= MAX_SEND_COUNT) {
            return true; // rate-limited
        }
    }

    // 2. Cross-check database for older OTPs that may have expired in memory
    if (db) {
        try {
            const dbEntry = await dbGet('sms_otps', phone);
            if (dbEntry) {
                const dbCreated = new Date(dbEntry.createdAt || dbEntry.created_at || 0).getTime();
                const withinWindow = Date.now() - dbCreated < RATE_LIMIT_WINDOW_MS;
                if (withinWindow && (dbEntry.sendCount || dbEntry.send_count || 0) >= MAX_SEND_COUNT) {
                    return true; // rate-limited
                }
            }
        } catch (err) {
            // Table may not exist yet — treat as not rate-limited
            if (!isTableNotFound(err)) {
                console.warn('[smsOtpHelper] Rate-limit DB check failed:', err.message);
            }
        }
    }

    return false; // allowed
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

/**
 * Verify an SMS OTP for the given phone number.
 * Checks:
 *   1. DEV_OTP_BYPASS (master OTP '112233' always passes when enabled)
 *   2. OTP existence (database first, then in-memory fallback)
 *   3. Expiry
 *   4. Attempt limit
 *   5. Code match
 * 
 * On success: deletes the OTP record (both db and memory).
 * On wrong attempt: increments attemptsCount in both db and memory.
 * 
 * @param {object|null} db   - Supabase client
 * @param {string} phone     - 10-digit normalized phone number
 * @param {string} otpCode   - OTP code entered by user
 * @returns {Promise<{valid: boolean, reason?: string}>}
 */
export async function verifySmsOTP(db, phone, otpCode) {
    // ── DEV OTP BYPASS ──
    if (isDevBypassEnabled() && otpCode === DEV_OTP) {
        // Clean up any real OTP for this number if it exists
        inMemorySmsOtpStore.delete(phone);
        if (db) {
            try {
                await dbRemove('sms_otps', phone);
            } catch (_) { /* ignore */ }
        }
        return { valid: true };
    }

    // ── 1. Fetch OTP data ──
    let otpData = null;

    // Try database first
    if (db) {
        try {
            const dbEntry = await dbGet('sms_otps', phone);
            if (dbEntry) {
                otpData = {
                    otpCode: dbEntry.otpCode || dbEntry.otp_code,
                    expiresAt: new Date(dbEntry.expiresAt || dbEntry.expires_at).getTime(),
                    attemptsCount: dbEntry.attemptsCount ?? dbEntry.attempts_count ?? 0,
                    sendCount: dbEntry.sendCount ?? dbEntry.send_count ?? 1
                };
            }
        } catch (err) {
            if (!isTableNotFound(err)) {
                console.warn('[smsOtpHelper] DB fetch failed:', err.message);
            }
        }
    }

    // Fallback to in-memory
    if (!otpData) {
        const memEntry = inMemorySmsOtpStore.get(phone);
        if (memEntry) {
            otpData = memEntry;
        }
    }

    // ── 2. No OTP found ──
    if (!otpData) {
        return { valid: false, reason: 'No OTP found for this number. Request a new one.' };
    }

    // ── 3. Check expiry ──
    if (Date.now() > otpData.expiresAt) {
        // Clean up expired OTP
        inMemorySmsOtpStore.delete(phone);
        if (db) {
            try { await dbRemove('sms_otps', phone); } catch (_) { /* ignore */ }
        }
        return { valid: false, reason: 'OTP expired. Please request a new one.' };
    }

    // ── 4. Check attempt limit ──
    if (otpData.attemptsCount >= MAX_ATTEMPTS) {
        inMemorySmsOtpStore.delete(phone);
        if (db) {
            try { await dbRemove('sms_otps', phone); } catch (_) { /* ignore */ }
        }
        return { valid: false, reason: 'Too many attempts. Please request a new OTP.' };
    }

    // ── 5. Check code match ──
    if (otpData.otpCode !== otpCode) {
        // Increment attempt count
        const newAttempts = (otpData.attemptsCount || 0) + 1;

        // Update in-memory
        const memEntry = inMemorySmsOtpStore.get(phone);
        if (memEntry) {
            memEntry.attemptsCount = newAttempts;
            inMemorySmsOtpStore.set(phone, memEntry);
        }

        // Update database
        if (db) {
            try {
                await dbUpdate('sms_otps', phone, { attemptsCount: newAttempts });
            } catch (err) {
                if (!isTableNotFound(err)) {
                    console.warn('[smsOtpHelper] Attempt update failed:', err.message);
                }
            }
        }

        const remaining = MAX_ATTEMPTS - newAttempts;
        return {
            valid: false,
            reason: remaining > 0
                ? `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
                : 'Invalid OTP. No attempts remaining. Please request a new OTP.'
        };
    }

    // ── 6. Success — clean up ──
    inMemorySmsOtpStore.delete(phone);
    if (db) {
        try { await dbRemove('sms_otps', phone); } catch (_) { /* ignore */ }
    }

    return { valid: true };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Check if a database error is due to the table not existing yet.
 * Matches the error codes that utils/db.js already handles.
 */
function isTableNotFound(err) {
    if (!err) return false;
    const code = err.code || '';
    return ['42P01', 'PGRST205', 'PGRST301'].includes(code);
}

/**
 * Get the current OTP data for a phone (for debugging/admin use).
 * @param {object|null} db
 * @param {string} phone
 * @returns {Promise<object|null>}
 */
export async function getSmsOTPData(db, phone) {
    // Try database first
    if (db) {
        try {
            const dbEntry = await dbGet('sms_otps', phone);
            if (dbEntry) return dbEntry;
        } catch (_) { /* fall through */ }
    }
    // Fallback to in-memory
    return inMemorySmsOtpStore.get(phone) || null;
}

/**
 * Manually delete an OTP (for admin/cancellation flows).
 * @param {object|null} db
 * @param {string} phone
 */
export async function deleteSmsOTP(db, phone) {
    inMemorySmsOtpStore.delete(phone);
    if (db) {
        try { await dbRemove('sms_otps', phone); } catch (_) { /* ignore */ }
    }
}