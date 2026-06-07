import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"Yatri Point" <noreply@yatripoint.com>';

let transporter = null;

// Initialize the Nodemailer transporter if credentials are provided
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // True for port 465, false for other ports (587, etc.)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  console.log(`[EMAIL SERVICE]: Nodemailer initialized for SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  console.warn(
    '[EMAIL SERVICE]: SMTP configuration missing. Verification codes will be printed to the server console instead of sending actual emails.'
  );
}

/**
 * Sends a premium branded OTP verification email
 * @param {string} email - Destination email address
 * @param {string} userName - Name of the user
 * @param {string} otpCode - 6-digit verification code
 * @returns {Promise<boolean>} True if email sent, false if printed to console or failed
 */
export async function sendVerificationEmail(email, userName, otpCode) {
  const recipientEmail = email.toLowerCase().trim();
  const displayName = userName || recipientEmail.split('@')[0];

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Account – Yatri Point</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
        background-color: #f7f9fa;
        color: #333333;
        -webkit-font-smoothing: antialiased;
      }
      .container {
        max-width: 600px;
        margin: 40px auto;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 30px rgba(0,0,0,0.06);
        border: 1px solid #e1e8ed;
      }
      .header {
        background: linear-gradient(135deg, #d84e55 0%, #b71c1c 100%);
        padding: 35px 20px;
        text-align: center;
        color: #ffffff;
      }
      .header h1 {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-shadow: 0 2px 4px rgba(0,0,0,0.15);
      }
      .tagline {
        margin: 5px 0 0 0;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 2px;
        opacity: 0.9;
        text-transform: uppercase;
      }
      .content {
        padding: 40px 40px 30px 40px;
        line-height: 1.6;
      }
      .greeting {
        font-size: 18px;
        font-weight: 700;
        margin-top: 0;
        color: #1a1a1a;
      }
      .message {
        font-size: 15px;
        color: #555555;
        margin-bottom: 30px;
      }
      .otp-card {
        background: #fff9f9;
        border: 2px dashed #ffcdd2;
        border-radius: 12px;
        padding: 25px;
        text-align: center;
        margin: 20px 0 30px 0;
      }
      .otp-code {
        font-size: 42px;
        font-weight: 900;
        letter-spacing: 6px;
        color: #b71c1c;
        margin: 0;
        display: inline-block;
        padding: 5px 15px;
      }
      .expiry {
        font-size: 13px;
        color: #7f8c8d;
        margin: 10px 0 0 0;
        font-weight: 500;
      }
      .warning-box {
        background-color: #fffde7;
        border-left: 4px solid #fbc02d;
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 25px;
      }
      .warning-text {
        margin: 0;
        font-size: 13.5px;
        color: #5d4037;
        font-weight: 500;
      }
      .footer {
        background-color: #f8f9fa;
        padding: 30px 40px;
        text-align: center;
        border-top: 1px solid #e1e8ed;
        font-size: 13px;
        color: #7f8c8d;
      }
      .footer p {
        margin: 0 0 10px 0;
      }
      .support-links {
        margin: 15px 0 0 0;
        padding: 0;
        list-style: none;
        display: inline-flex;
        gap: 15px;
      }
      .support-links a {
        color: #d84e55;
        text-decoration: none;
        font-weight: 600;
      }
      .support-links a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Yatri Point</h1>
          <div class="tagline">TRAVEL & STAY</div>
      </div>
      <div class="content">
        <p class="greeting">Namaste ${displayName},</p>
        <p class="message">
          Thank you for creating an account with <strong>Yatri Point</strong>. To complete your signup and verify your email address, please use the 6-digit verification code below:
        </p>
        <div class="otp-card">
          <div class="otp-code">${otpCode}</div>
          <p class="expiry">⌛ Valid for exactly 5 minutes</p>
        </div>
        <div class="warning-box">
          <p class="warning-text">
            <strong>Security Warning:</strong> For your security, never share this verification code with anyone. Yatri Point employees will never ask for this code.
          </p>
        </div>
        <p class="message" style="margin-bottom: 0;">
          If you did not attempt to create an account, please ignore this email or contact support if you have concerns.
        </p>
      </div>
      <div class="footer">
        <p><strong>Yatri Point (Travel & Stay)</strong> · Bihar's Premier Booking Aggregator</p>
        <p>Providing Bus, Hotel, Rapid Car & Local Café bookings across India.</p>
        <p style="margin: 15px 0 0 0; font-size: 12px; opacity: 0.85;">
          © 2026 Yatri Point. All rights reserved.
        </p>
        <div class="support-links">
          <span>Support: <a href="tel:+918178030064">+91-8178030064</a></span>
          <span>·</span>
          <span><a href="mailto:support@yatripoint.onrender.com">support@yatripoint.onrender.com</a></span>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: recipientEmail,
        subject: 'Verify Your Account – Yatri Point',
        html: htmlContent
      });
      console.log(`[EMAIL SERVICE]: Verification code sent successfully to ${recipientEmail}`);
      return true;
    } catch (err) {
      console.error(`[EMAIL SERVICE ERROR] Failed to send email to ${recipientEmail}:`, err.message);
      return false;
    }
  }

  // Developer fallback
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`🚨 [DEVELOPER MAIL BOX] Verification OTP for ${recipientEmail}:`);
  console.log(`👉 Code: ${otpCode}`);
  console.log('═══════════════════════════════════════════════════════════════');
  return false;

}


export function getEmailDeliveryStatus() {
  return {
    configured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
    host: SMTP_HOST || '',
    port: Number(SMTP_PORT),
    from: SMTP_FROM,
    user: SMTP_USER || '',
    devBypassEnabled: process.env.DEV_OTP_BYPASS === 'true'
  };
}

let transporterVerified = false;
let transporterVerifyAttempted = false;

export async function verifyEmailTransport() {
  if (!transporter) {
    return {
      success: false,
      configured: false,
      message: 'SMTP configuration missing. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM to enable real email delivery.'
    };
  }

  if (transporterVerified) {
    return {
      success: true,
      configured: true,
      message: `SMTP transport already verified for ${SMTP_HOST}:${SMTP_PORT}`
    };
  }

  try {
    await transporter.verify();
    transporterVerified = true;
    transporterVerifyAttempted = true;
    console.log(`[EMAIL SERVICE]: SMTP transport verified successfully for ${SMTP_HOST}:${SMTP_PORT}`);
    return {
      success: true,
      configured: true,
      message: `SMTP transport verified successfully for ${SMTP_HOST}:${SMTP_PORT}`
    };
  } catch (err) {
    transporterVerifyAttempted = true;
    transporterVerified = false;
    console.error(`[EMAIL SERVICE ERROR]: SMTP transport verification failed for ${SMTP_HOST}:${SMTP_PORT}:`, err.message);
    return {
      success: false,
      configured: true,
      message: `SMTP transport verification failed: ${err.message}`
    };
  }
}

