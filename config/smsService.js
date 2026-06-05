/**
 * backend/config/smsService.js
 *
 * Sends OTP via MSG91 OTP API.
 * Falls back to console logging when MSG91 credentials are not configured.
 */

const axios = require('axios');

const authKey = process.env.MSG91_AUTH_KEY;
const templateId = process.env.MSG91_TEMPLATE_ID;

/**
 * Send OTP SMS via MSG91.
 *
 * @param {string} phoneNumber — 10-digit Indian mobile number
 * @param {string} otpCode — 6-digit OTP code
 * @returns {{ success: boolean, logged?: boolean, error?: string }}
 */
async function sendOtpSms(phoneNumber, otpCode) {
  let cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const maskedOtp = process.env.NODE_ENV === 'production' ? '******' : otpCode;
  console.log(`[SMS Service] Dispatching OTP [${maskedOtp}] to phone number [${cleanPhone}]`);

  // Fallback for development if keys are not configured
  if (!authKey || !templateId) {
    console.warn('[SMS Service] ⚠️  MSG91 credentials not configured. Running in DEMO MODE.');
    console.log(`[SMS Service] 📱 DEMO OTP for ${cleanPhone}: ${otpCode}`);
    return { success: true, logged: true };
  }

  try {
    const response = await axios.post(
      'https://control.msg91.com/api/v5/otp',
      {
        template_id: templateId,
        mobile: cleanPhone,
        otp: otpCode,
      },
      {
        headers: {
          authkey: authKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('[SMS Service] MSG91 Response:', response.data);
    return { success: true };
  } catch (error) {
    console.error('[SMS Service] MSG91 Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendOtpSms };
