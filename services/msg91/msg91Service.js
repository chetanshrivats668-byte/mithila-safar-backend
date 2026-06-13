const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '504876AD0r3lYK6a292cd5P1';
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '65f5c8f0d6fc050f3c5e3f3b';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || 'YTRIPT';

export async function sendOTP(phone, otpCode) {
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

export async function verifyOTP(phone, otpCode) {
  const url = 'https://control.msg91.com/api/v5/otp/verify';
  const payload = {
    authkey: MSG91_AUTH_KEY,
    mobile: phone.replace('+91', ''),
    otp: otpCode
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.message || 'MSG91 OTP verify failed');
    err.statusCode = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}