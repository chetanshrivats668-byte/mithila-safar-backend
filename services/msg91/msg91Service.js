const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY;
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '65f5c8f0d6fc050f3c5e3f3b';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'YTRIPT';

function ensureMsg91Configured() {
  if (!MSG91_AUTH_KEY) {
    throw new Error('MSG91_AUTH_KEY is required');
  }
}

export async function sendOTP(phone, otpCode) {
  ensureMsg91Configured();
  const url = 'https://control.msg91.com/api/v5/otp/send';
  const payload = {
    template_id: MSG91_TEMPLATE_ID,
    mobile: phone.replace('+91', ''),
    authkey: MSG91_AUTH_KEY,
    otp: otpCode,
    sender: MSG91_SENDER_ID
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || 'MSG91 OTP send failed');
    err.statusCode = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function verifyWidgetToken(accessToken) {
  ensureMsg91Configured();
  // Using the widget token verification API
  const url = 'https://api.msg91.com/api/v5/widget/verifyAccessToken';
  const payload = {
    "access-token": accessToken
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'authkey': MSG91_AUTH_KEY 
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.type === 'error') {
    const err = new Error(data?.message || 'MSG91 widget token verify failed');
    err.statusCode = response.status !== 200 ? response.status : 400;
    err.payload = data;
    throw err;
  }
  return data;
}