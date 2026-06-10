const MSG91_AUTH_KEY = (process.env.MSG91_AUTH_KEY || '').trim();
const MSG91_FLOW_ID = (process.env.MSG91_FLOW_ID || '').trim();
const MSG91_SENDER_ID = (process.env.MSG91_SENDER_ID || 'YATRIP').trim();

/**
 * Sends an SMS using MSG91 Flow API.
 * 
 * @param {string} phone - Destination phone number
 * @param {string} message - Message body/content
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function sendSMS(phone, message) {
  let cleanPhone = phone.replace(/\D/g, '');
  // Normalize Indian phone numbers: remove leading +91 or 91
  if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
    cleanPhone = cleanPhone.substring(2);
  }
  if (cleanPhone.length !== 10) {
    console.warn('[SMS SERVICE]: Invalid phone for SMS:', phone);
    return { success: false, reason: 'invalid_phone' };
  }

  // Check configuration
  const isConfigured = Boolean(MSG91_AUTH_KEY && MSG91_FLOW_ID && MSG91_FLOW_ID !== 'your_general_flow_id');

  if (!isConfigured) {
    console.warn('[SMS SERVICE]: MSG91 configuration missing or uses placeholder flow ID. Printing SMS to console instead.');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🚨 [DEVELOPER SMS BOX] SMS to +91-${cleanPhone}:`);
    console.log(`👉 Message: ${message}`);
    console.log('═══════════════════════════════════════════════════════════════');
    // Return success in development to keep the app working
    return { success: true, reason: 'mock_success' };
  }

  try {
    const url = 'https://control.msg91.com/api/v5/flow';
    
    // Parse out OTP or code if message has one, in case template expects it
    let otpCode = '';
    const otpMatch = message.match(/\b\d{6}\b/);
    if (otpMatch) {
      otpCode = otpMatch[0];
    }

    const payload = {
      template_id: MSG91_FLOW_ID,
      sender: MSG91_SENDER_ID,
      recipients: [
        {
          mobiles: '91' + cleanPhone,
          message: message,
          otp: otpCode || message,
          otpCode: otpCode || message,
          code: otpCode || message,
          // Custom templates might use variables:
          var1: message,
          var2: otpCode
        }
      ]
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
      console.error(`[SMS SERVICE ERROR]: HTTP error: ${response.status}`);
      return { success: false, reason: `HTTP error ${response.status}` };
    }

    const data = await response.json();
    if (data.status === 'success' || data.type === 'success' || data.return === true) {
      console.log(`[SMS SERVICE]: SMS sent successfully to +91-${cleanPhone} via MSG91`);
      return { success: true };
    } else {
      console.error('[SMS SERVICE ERROR]: MSG91 returned error:', data);
      return { success: false, reason: data.message || 'MSG91 API error' };
    }
  } catch (err) {
    console.error(`[SMS SERVICE ERROR]: Failed to send SMS to +91-${cleanPhone}:`, err.message);
    return { success: false, reason: err.message };
  }
}
