const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { sendOtpSms } = require('../config/smsService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiters
// ─────────────────────────────────────────────────────────────────────────────

const phoneLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many OTP requests. Please wait 10 minutes.' },
});

const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many verification attempts. Please wait 10 minutes.' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 30;
const OTP_EXPIRY_MINUTES = 5;
const JWT_EXPIRY = '7d';

function signToken(driverId, phone) {
  return jwt.sign({ driverId, phone }, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/onboarding/phone
// ─────────────────────────────────────────────────────────────────────────────
router.post('/phone',
  phoneLimiter,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { phoneNumber } = req.body;

      const { data: existingDriver } = await supabase
        .from('drivers')
        .select('id, phone')
        .eq('phone', phoneNumber)
        .maybeSingle();

      let driverId;
      if (!existingDriver) {
        driverId = uuidv4();
        const { error } = await supabase
          .from('drivers')
          .insert({
            id: driverId,
            phone: phoneNumber,
            onboarding_status: 'started',
            created_at: new Date(),
          });
        if (error) throw error;
      } else {
        driverId = existingDriver.id;
      }

      // Generate 6-digit OTP
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const otpExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

      const { error: otpErr } = await supabase
        .from('drivers')
        .update({
          otp_code: otpCode,
          otp_expiry: otpExpiry,
          otp_attempts: 0,
          otp_locked_until: null,
          updated_at: new Date(),
        })
        .eq('id', driverId);

      if (otpErr) throw otpErr;

      // Send via MSG91
      const smsResult = await sendOtpSms(phoneNumber, otpCode);
      if (!smsResult.success) {
        console.warn(`[Phone] SMS dispatch failed for ${phoneNumber}: ${smsResult.error}`);
      }

      return res.json({
        success: true,
        message: 'OTP generated and sent',
        ...(smsResult.logged && { demoOtp: otpCode }),
      });
    } catch (error) {
      console.error('Phone submission error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/onboarding/verify-otp
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-otp',
  verifyLimiter,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('otpCode').isLength({ min: 6, max: 6 }).isNumeric().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { phoneNumber, otpCode } = req.body;

      const { data: driver, error: fetchErr } = await supabase
        .from('drivers')
        .select('*')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Brute-force lock check
      if (driver.otp_locked_until) {
        const lockExpiry = new Date(driver.otp_locked_until);
        if (lockExpiry > new Date()) {
          const minutesLeft = Math.ceil((lockExpiry - new Date()) / 60000);
          return res.status(429).json({
            error: `Too many failed attempts. Please try again in ${minutesLeft} minutes.`,
          });
        }
        await supabase.from('drivers')
          .update({ otp_locked_until: null, otp_attempts: 0 })
          .eq('id', driver.id);
      }

      // Validate OTP
      if (!driver.otp_code || driver.otp_code !== otpCode) {
        const newAttempts = (driver.otp_attempts || 0) + 1;
        const updatePayload = { otp_attempts: newAttempts, updated_at: new Date() };

        if (newAttempts >= MAX_OTP_ATTEMPTS) {
          updatePayload.otp_locked_until = new Date(
            Date.now() + OTP_LOCK_MINUTES * 60 * 1000
          ).toISOString();
        }

        await supabase.from('drivers').update(updatePayload).eq('id', driver.id);

        const remaining = MAX_OTP_ATTEMPTS - newAttempts;
        const msg = remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : `Too many failed attempts. Locked for ${OTP_LOCK_MINUTES} minutes.`;

        return res.status(400).json({ error: msg });
      }

      // Check expiry
      if (new Date(driver.otp_expiry) < new Date()) {
        return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
      }

      // Success — clear OTP, mark verified
      const { data: updatedDriver, error: updateErr } = await supabase
        .from('drivers')
        .update({
          phone_verified: true,
          onboarding_status: 'phone_verified',
          otp_code: null,
          otp_expiry: null,
          otp_attempts: 0,
          otp_locked_until: null,
          updated_at: new Date(),
        })
        .eq('id', driver.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Issue JWT
      const token = signToken(driver.id, phoneNumber);

      return res.json({
        success: true,
        message: 'Phone number verified successfully',
        token,
        driver: updatedDriver,
      });
    } catch (error) {
      console.error('OTP verification error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/onboarding/account
// ─────────────────────────────────────────────────────────────────────────────
router.post('/account',
  requireAuth,
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 6 }).trim(),
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { username, password, phoneNumber } = req.body;

      const { data: existingDriver, error: fetchError } = await supabase
        .from('drivers')
        .select('*')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (fetchError) return res.status(500).json({ success: false, error: fetchError.message });
      if (!existingDriver) return res.status(404).json({ success: false, error: 'Driver not found' });

      const hashedPassword = await bcrypt.hash(password, 12);

      const { data, error } = await supabase
        .from('drivers')
        .update({
          username,
          password: hashedPassword,
          account_status: 'active',
          onboarding_status: 'account_created',
          updated_at: new Date(),
        })
        .eq('phone', phoneNumber)
        .select()
        .maybeSingle();

      if (error) return res.status(500).json({ success: false, error: error.message });

      return res.json({ success: true, driver: data });
    } catch (error) {
      console.error('Account creation error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/onboarding/personal-details
// ─────────────────────────────────────────────────────────────────────────────
router.post('/personal-details',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('fullName').isLength({ min: 2 }).trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().trim(),
  body('dob').matches(/^\d{2}\/\d{2}\/\d{4}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const {
        phoneNumber, fullName, email, gender, dob,
        address, city, pincode, emergencyContact, relationship, referralCode,
      } = req.body;

      const { data, error } = await supabase
        .from('drivers')
        .update({
          full_name: fullName,
          email: email || null,
          gender, dob, address, city, pincode,
          emergency_contact: emergencyContact,
          emergency_contact_relationship: relationship,
          referral_code: referralCode,
          onboarding_status: 'personal_details_completed',
          updated_at: new Date(),
        })
        .eq('phone', phoneNumber)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, driver: data });
    } catch (error) {
      console.error('Personal details error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/onboarding/service-selection
// ─────────────────────────────────────────────────────────────────────────────
router.post('/service-selection',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('selectedService').isIn(['2_wheeler', '3_wheeler', '4_wheeler', 'pooling']),
  body('subService').optional().isIn(['inside_city', 'city_to_city', 'both']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { phoneNumber, selectedService, subService } = req.body;

      const { data, error } = await supabase
        .from('drivers')
        .update({
          selected_service: selectedService,
          sub_service: subService || null,
          onboarding_status: 'service_selected',
          updated_at: new Date(),
        })
        .eq('phone', phoneNumber)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, driver: data });
    } catch (error) {
      console.error('Service selection error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED: GET /api/onboarding/driver/:phoneNumber
// ─────────────────────────────────────────────────────────────────────────────
router.get('/driver/:phoneNumber', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', req.params.phoneNumber)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Driver not found' });
    res.json({ success: true, driver: data });
  } catch (error) {
    console.error('Driver retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED: POST /api/onboarding/complete
// ─────────────────────────────────────────────────────────────────────────────
router.post('/complete',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { data, error } = await supabase
        .from('drivers')
        .update({
          onboarding_status: 'completed',
          onboarding_completed_at: new Date(),
          updated_at: new Date(),
        })
        .eq('phone', req.body.phoneNumber)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, message: 'Onboarding completed', driver: data });
    } catch (error) {
      console.error('Onboarding completion error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
