import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

let googleClient = null;

if (GOOGLE_CLIENT_ID) {
  googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  console.log('🌐 [GOOGLE AUTH SERVICE]: Initialized with Client ID:', GOOGLE_CLIENT_ID.substring(0, 15) + '...');
} else {
  console.error('[GOOGLE AUTH SERVICE] FATAL: GOOGLE_CLIENT_ID environment variable is missing!');
}

/**
 * Verifies a Google ID Token (credential) received from the client
 * @param {string} credential - JWT credential token sent by Google Identity Services
 * @returns {Promise<Object>} The verified user payload containing email, name, picture, and sub (Google ID)
 */
export async function verifyGoogleToken(credential) {
  try {
    if (!credential) {
      throw new Error('Google credential is required');
    }
    if (!GOOGLE_CLIENT_ID || !googleClient) {
      throw new Error('Google OAuth client is not initialized because GOOGLE_CLIENT_ID is missing');
    }

    // Decode basic parts for diagnostics
    const parts = credential.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format in Google credential');
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Empty payload returned from Google verification');
    }

    // Verify critical fields
    if (!payload.email) {
      throw new Error('Email not provided in Google ID token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase().trim(),
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || '',
      email_verified: payload.email_verified === true
    };
  } catch (err) {
    console.error('[GOOGLE AUTH SERVICE ERROR] Token verification failed:', err.message);
    throw err; // Escalate error to controller for proper HTTP status response
  }
}
