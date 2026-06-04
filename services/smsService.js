const FAST2SMS_API_KEY = (process.env.FAST2SMS_API_KEY || '').trim();

export async function sendSMS(phone, message) {
  if (!FAST2SMS_API_KEY) {
    console.warn('FAST2SMS_API_KEY not set — SMS not sent to', phone);
    return { success: false, reason: 'no_api_key' };
  }
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('91') && cleanPhone.length === 12) cleanPhone = cleanPhone.substring(2);
  if (cleanPhone.length !== 10) {
    console.warn('Invalid phone for SMS:', phone);
    return { success: false, reason: 'invalid_phone' };
  }

  const endpoints = [
    'https://www.fast2sms.com/dev/bulkV2',
    'https://www.fast2sms.com/json/send',
    'https://www.fast2sms.com/api/sms'
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'authorization': FAST2SMS_API_KEY,
          'Content-Type': 'application/json',
          'cache-control': 'no-cache'
        },
        body: JSON.stringify({
          route: 'v3',
          sender_id: 'TXTIND',
          message: message.substring(0, 200),
          numbers: cleanPhone,
          flash: 0
        })
      });

      if (!response.ok) {
        console.error('SMS HTTP error:', endpoint, response.status);
        continue;
      }

      const data = await response.json();
      if (data.return === true || data.status === '200' || data.request_id || data.sms_id) {
        console.log('SMS sent to', cleanPhone, 'via', endpoint);
        return { success: true };
      }
    } catch (endpointError) {
      console.error('SMS endpoint error:', endpoint, endpointError.message);
    }
  }

  return { success: false, reason: 'All endpoints failed' };
}
