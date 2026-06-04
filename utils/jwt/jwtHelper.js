import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes access token expiry
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days refresh token expiry
const COLLABORATOR_ACCESS_EXPIRY = '8h'; // 8 hours for collaborators/admins

if (!JWT_SECRET) {
  console.error('[JWT HELPER] FATAL: JWT_SECRET environment variable is missing!');
}

/**
 * Generates a signed Access JWT token
 * @param {Object} payload - Data to encode in the token
 * @param {boolean} isUser - If true, sets expiry to 15m, else 8h (for admin/partner)
 * @returns {string} Signed JWT Access Token
 */
export function generateAccessToken(payload, isUser = false) {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured on this server');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be a non-null object');
    }
    return jwt.sign(
      { ...payload, tokenType: 'access' },
      JWT_SECRET,
      { expiresIn: isUser ? ACCESS_TOKEN_EXPIRY : COLLABORATOR_ACCESS_EXPIRY }
    );
  } catch (err) {
    console.error('[JWT HELPER ERROR] Access generation failed:', err.message);
    throw err;
  }
}

/**
 * Generates a signed Refresh JWT token
 * @param {Object} payload - Data to encode in the token
 * @param {boolean} isUser - Custom flag for future extension
 * @returns {string} Signed JWT Refresh Token
 */
export function generateRefreshToken(payload, isUser = false) {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured on this server');
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('Payload must be a non-null object');
    }
    // Limit refresh payload to key claims to keep token compact and stateless
    const refreshPayload = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role || 'user',
      tokenType: 'refresh'
    };
    if (payload.temporarySession) {
      refreshPayload.temporarySession = true;
    }
    return jwt.sign(
      refreshPayload,
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );
  } catch (err) {
    console.error('[JWT HELPER ERROR] Refresh generation failed:', err.message);
    throw err;
  }
}

/**
 * Generates a signed JWT token (Legacy compatibility)
 */
export function generateToken(payload, isUser = false) {
  return generateAccessToken(payload, isUser);
}

/**
 * Verifies a signed JWT token (Core decoder)
 * @param {string} token - Signed JWT token
 * @returns {Object} Decoded payload
 */
export function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('No token provided to verify');
    }
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured on this server');
    }
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      console.warn('[JWT HELPER] Token has expired:', err.message);
    } else if (err instanceof jwt.JsonWebTokenError) {
      console.warn('[JWT HELPER] Invalid token signature/format:', err.message);
    } else {
      console.error('[JWT HELPER ERROR] Verification error:', err.message);
    }
    throw err;
  }
}

/**
 * Verifies a signed Access JWT token
 */
export function verifyAccessToken(token) {
  const decoded = verifyToken(token);
  if (!decoded || decoded.tokenType !== 'access') {
    throw new Error('Invalid token type: Expected access token');
  }
  return decoded;
}

/**
 * Verifies a signed Refresh JWT token
 */
export function verifyRefreshToken(token) {
  const decoded = verifyToken(token);
  if (!decoded || decoded.tokenType !== 'refresh') {
    throw new Error('Invalid token type: Expected refresh token');
  }
  return decoded;
}
