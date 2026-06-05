/**
 * backend/config/smsService.js
 *
 * CENTRALIZED SMS GATEWAY (MSG91)
 *
 * This service handles sending OTP messages using the MSG91 API.
 * In development, if credentials are not specified, it falls back
 * to console-logging the OTP to allow testing without an active MSG91 account.
 */

const axios = require('axios');

/**
 * Sends a 6-digit OTP to the specified mobile number via MSG91 SMS API.
 *
 * @param {string} phoneNumber - Indian mobile number (e.g., '+919999999999' or '9999999999')
 * @param {string} otpCode - The 6-digit OTP code to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendOtpSms(phoneNumber, otpCode) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  // Clean the phone number (MSG91 expects digits only, e.g. '919999999999' for India, no + sign)
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  
  // If the number is 10 digits, prepend '91' country code
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }

  const maskedOtp = process.env.NODE_ENV === 'production' ? '******' : otpCode;
  console.log(`[SMS Service] Dispatching OTP [${maskedOtp}] to phone number [${cleanPhone}]`);

  // Fallback for development if keys are not configured
  if (!authKey || !templateId) {
    console.warn(
      '⚠️  [SMS Service] MSG91 credentials (MSG91_AUTH_KEY or MSG91_TEMPLATE_ID) are missing.\n' +
      `   --> [DEMO MODE] OTP for ${cleanPhone} is: ${otpCode}\n` +
      '   --> Please verify using this code.'
    );
    return { success: true, logged: true };
  }

  try {
    const response = await axios.post(
      'https://control.msg91.com/api/v5/otp',
      {
        template_id: templateId,
        mobile: cleanPhone,
        authkey: authKey,
        otp: otpCode,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data && response.data.type === 'success') {
      console.log(`✓ [SMS Service] MSG91 API successfully sent OTP to ${cleanPhone}`);
      return { success: true };
    } else {
      console.error(`✗ [SMS Service] MSG91 error response:`, response.data);
      return {
        success: false,
        error: response.data.message || 'MSG91 dispatch failed',
      };
    }
  } catch (error) {
    console.error(`✗ [SMS Service] Axios failed to connect to MSG91:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = { sendOtpSms };
