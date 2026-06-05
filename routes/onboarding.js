const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/onboarding/register-driver
//
// Called by the frontend after successful Supabase OTP verification.
// Creates the driver record in our database if it doesn't exist.
// The phone number comes from the authenticated Supabase session.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register-driver',
  requireAuth,
  async (req, res) => {
    try {
      // Phone comes from the verified Supabase token (set by auth middleware)
      const phoneNumber = req.driverPhone;
      const supabaseUserId = req.supabaseUser?.id;

      if (!phoneNumber) {
        return res.status(400).json({ success: false, error: 'Phone number not found in session.' });
      }

      // Check if driver already exists
      const { data: existingDriver } = await supabase
        .from('drivers')
        .select('id, phone')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (existingDriver) {
        // Update Supabase user ID link if not already set
        if (supabaseUserId) {
          await supabase
            .from('drivers')
            .update({
              supabase_user_id: supabaseUserId,
              phone_verified: true,
              updated_at: new Date(),
            })
            .eq('id', existingDriver.id);
        }

        return res.json({
          success: true,
          message: 'Driver already registered',
          driver: existingDriver,
        });
      }

      // Create new driver record
      const driverId = uuidv4();
      const { data: newDriver, error } = await supabase
        .from('drivers')
        .insert({
          id: driverId,
          phone: phoneNumber,
          supabase_user_id: supabaseUserId || null,
          phone_verified: true,
          onboarding_status: 'phone_verified',
          created_at: new Date(),
        })
        .select()
        .single();

      if (error) throw error;

      return res.json({
        success: true,
        message: 'Driver registered successfully',
        driver: newDriver,
      });
    } catch (error) {
      console.error('Driver registration error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES (Supabase JWT auth required)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @POST /api/onboarding/account
 * Create user account with a securely hashed password.
 */
router.post(
  '/account',
  requireAuth,
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 6 }).trim(),
  body('phoneNumber').isMobilePhone('en-IN').trim(),

  async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());

      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {

      const { username, password, phoneNumber } = req.body;

      console.log('============================');
      console.log('ACCOUNT CREATION STARTED');
      console.log('username:', username);
      console.log('phoneNumber:', phoneNumber);

      // Check if driver exists
      const { data: existingDriver, error: fetchError } = await supabase
        .from('drivers')
        .select('*')
        .eq('phone', phoneNumber)
        .maybeSingle();

      console.log('Existing driver:', existingDriver);

      if (fetchError) {
        console.error('Fetch driver error:', fetchError);

        return res.status(500).json({
          success: false,
          error: fetchError.message,
          details: fetchError,
        });
      }

      if (!existingDriver) {
        return res.status(404).json({
          success: false,
          error: 'Driver not found',
        });
      }

      // Hash password
      console.log('Hashing password...');

      const hashedPassword = await bcrypt.hash(password, 12);

      console.log('Password hashed successfully');

      // Update account
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

      if (error) {

        console.error('============================');
        console.error('SUPABASE UPDATE ERROR');
        console.error(error);

        return res.status(500).json({
          success: false,
          error: error.message,
          details: error,
        });
      }

      console.log('============================');
      console.log('ACCOUNT CREATED SUCCESSFULLY');
      console.log(data);

      return res.json({
        success: true,
        driver: data,
      });

    } catch (error) {

      console.error('============================');
      console.error('ACCOUNT CREATION CRASH');
      console.error(error);

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * @POST /api/onboarding/personal-details
 * Save driver personal details.
 */
router.post('/personal-details',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('fullName').isLength({ min: 2 }).trim(),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().trim(),
  body('dob').matches(/^\d{2}\/\d{2}\/\d{4}$/),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        phoneNumber,
        fullName,
        email,
        gender,
        dob,
        address,
        city,
        pincode,
        emergencyContact,
        relationship,
        referralCode,
      } = req.body;

      const { data, error } = await supabase
        .from('drivers')
        .update({
          full_name: fullName,
          email: email || null,
          gender,
          dob,
          address,
          city,
          pincode,
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

/**
 * @POST /api/onboarding/service-selection
 * Save service selection.
 */
router.post('/service-selection',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('selectedService').isIn(['2_wheeler', '3_wheeler', '4_wheeler', 'pooling']),
  body('subService').optional().isIn(['inside_city', 'city_to_city', 'both']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

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

/**
 * @GET /api/onboarding/driver/:phoneNumber
 * Retrieve driver onboarding status.
 */
router.get('/driver/:phoneNumber', requireAuth, async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('phone', phoneNumber)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({ success: true, driver: data });
  } catch (error) {
    console.error('Driver retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @POST /api/onboarding/complete
 * Mark onboarding as complete.
 */
router.post('/complete',
  requireAuth,
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { phoneNumber } = req.body;

      const { data, error } = await supabase
        .from('drivers')
        .update({
          onboarding_status: 'completed',
          onboarding_completed_at: new Date(),
          updated_at: new Date(),
        })
        .eq('phone', phoneNumber)
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
