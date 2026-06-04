const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { initFirebaseAdmin } = require('../config/firebaseAdmin');

const router = express.Router();

/**
 * @POST /api/onboarding/phone
 * Submit phone number — creates driver record if it doesn't exist.
 * The actual OTP is sent client-side via Firebase Phone Auth.
 */
router.post('/phone',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { phoneNumber } = req.body;

      // Check if driver already exists
      const { data: existingDriver } = await supabase
        .from('drivers')
        .select('id, phone')
        .eq('phone', phoneNumber)
        .maybeSingle();

      if (!existingDriver) {
        const { data, error } = await supabase
          .from('drivers')
          .insert({
            id: uuidv4(),
            phone: phoneNumber,
            onboarding_status: 'started',
            created_at: new Date(),
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, user: data });
      }

      return res.json({ success: true, user: existingDriver });
    } catch (error) {
      console.error('Phone submission error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @POST /api/onboarding/firebase-verify
 * Server-side verification of the Firebase Phone Auth ID token.
 * Called after the client completes signInWithCredential() and obtains an ID token.
 *
 * Body: { phoneNumber: string, idToken: string }
 *
 * Flow:
 *  1. admin.auth().verifyIdToken(idToken)  — cryptographically verify with Firebase
 *  2. Upsert the driver row with firebase_uid + phone_verified = true
 *  3. Return { success: true, uid }
 */
router.post('/firebase-verify',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('idToken').isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const admin = initFirebaseAdmin();
    if (!admin) {
      return res.status(503).json({
        error: 'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON in .env',
      });
    }

    try {
      const { phoneNumber, idToken } = req.body;

      // Cryptographically verify the Firebase ID token
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (verifyErr) {
        console.error('Firebase token verification failed:', verifyErr.message);
        return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
      }

      const firebaseUid = decodedToken.uid;

      // Upsert the driver: mark phone as verified and store firebase_uid
      const { data: driver, error: upsertErr } = await supabase
        .from('drivers')
        .upsert(
          {
            phone: phoneNumber,
            firebase_uid: firebaseUid,
            phone_verified: true,
            onboarding_status: 'phone_verified',
            updated_at: new Date(),
          },
          { onConflict: 'phone' }
        )
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      return res.json({ success: true, uid: firebaseUid, driver });
    } catch (error) {
      console.error('Firebase verify error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @POST /api/onboarding/account
 * Create user account with a securely hashed password.
 */
router.post('/account',
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 6 }).trim(),
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { username, password, phoneNumber } = req.body;

      // Hash password with bcrypt (12 salt rounds)
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update driver with account details
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
        .single();

      if (error) throw error;

      res.json({ success: true, driver: data });
    } catch (error) {
      console.error('Account creation error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @POST /api/onboarding/personal-details
 * Save driver personal details.
 */
router.post('/personal-details',
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

      // Update driver personal details
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
router.get('/driver/:phoneNumber', async (req, res) => {
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
