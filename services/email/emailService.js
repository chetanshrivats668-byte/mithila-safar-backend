const MSG91_AUTH_KEY = (process.env.MSG91_AUTH_KEY || '').trim();
const MSG91_EMAIL_TEMPLATE_ID = (process.env.MSG91_EMAIL_TEMPLATE_ID || '').trim();
const MSG91_FROM_EMAIL = (process.env.MSG91_FROM_EMAIL || '').trim();
const MSG91_FROM_NAME = (process.env.MSG91_FROM_NAME || 'Yatri Point').trim();
const MSG91_EMAIL_DOMAIN = (process.env.MSG91_EMAIL_DOMAIN || '').trim();

/**
 * Sends a premium branded OTP verification email using the MSG91 Email API.
 * 
 * @param {string} email - Destination email address
 * @param {string} userName - Name of the user
 * @param {string} otpCode - 6-digit verification code
 * @returns {Promise<boolean>} True if email sent, false if printed to console or failed
 */
export async function sendVerificationEmail(email, userName, otpCode) {
  const recipientEmail = email.toLowerCase().trim();
  const displayName = userName || recipientEmail.split('@')[0];

  const isConfigured = Boolean(MSG91_AUTH_KEY && MSG91_EMAIL_TEMPLATE_ID && MSG91_FROM_EMAIL && MSG91_EMAIL_DOMAIN);

  if (!isConfigured) {
    console.warn(
      '[EMAIL SERVICE]: MSG91 email configuration missing. Verification codes will be printed to the server console instead of sending actual emails.'
    );
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🚨 [DEVELOPER MAIL BOX] Verification OTP for ${recipientEmail}:`);
    console.log(`👉 Code: ${otpCode}`);
    console.log('═══════════════════════════════════════════════════════════════');
    return false;
  }

  try {
    const url = 'https://control.msg91.com/api/v5/email/send';
    const payload = {
      recipients: [
        {
          to: [
            {
              name: displayName,
              email: recipientEmail
            }
          ],
          variables: {
            name: displayName,
            otp: otpCode,
            otpCode: otpCode,
            code: otpCode
          }
        }
      ],
      from: {
        name: MSG91_FROM_NAME,
        email: MSG91_FROM_EMAIL
      },
      domain: MSG91_EMAIL_DOMAIN,
      template_id: MSG91_EMAIL_TEMPLATE_ID
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authkey': MSG91_AUTH_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[EMAIL SERVICE ERROR] MSG91 HTTP error:`, response.status);
      return false;
    }

    const data = await response.json();
    if (data.status === 'success' || data.type === 'success') {
      console.log(`[EMAIL SERVICE]: Verification email sent successfully to ${recipientEmail} via MSG91`);
      return true;
    } else {
      console.error(`[EMAIL SERVICE ERROR] MSG91 returned error:`, data);
      return false;
    }
  } catch (err) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send email to ${recipientEmail}:`, err.message);
    return false;
  }
}

/**
 * Returns the email delivery configuration and status.
 */
export function getEmailDeliveryStatus() {
  return {
    configured: Boolean(MSG91_AUTH_KEY && MSG91_EMAIL_TEMPLATE_ID && MSG91_FROM_EMAIL && MSG91_EMAIL_DOMAIN),
    provider: 'MSG91',
    fromEmail: MSG91_FROM_EMAIL,
    fromName: MSG91_FROM_NAME,
    domain: MSG91_EMAIL_DOMAIN
  };
}

/**
 * Verifies email transport configuration (checks environment variables).
 */
export async function verifyEmailTransport() {
  const isConfigured = Boolean(MSG91_AUTH_KEY && MSG91_EMAIL_TEMPLATE_ID && MSG91_FROM_EMAIL && MSG91_EMAIL_DOMAIN);
  if (!isConfigured) {
    return {
      success: false,
      configured: false,
      message: 'MSG91 Email configuration missing. Set MSG91_AUTH_KEY, MSG91_EMAIL_TEMPLATE_ID, MSG91_FROM_EMAIL, and MSG91_EMAIL_DOMAIN.'
    };
  }
  return {
    success: true,
    configured: true,
    message: `MSG91 email service is configured and ready using verified domain: ${MSG91_EMAIL_DOMAIN}`
  };
}
