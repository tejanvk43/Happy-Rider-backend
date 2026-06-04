const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * @POST /api/kyc/upload
 * Upload KYC documents
 */
router.post('/upload',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('docType').isIn(['profilePhoto', 'aadhaar', 'pan', 'license', 'faceScan']),
  body('fileUri').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { phoneNumber, docType, fileUri } = req.body;

      // Get driver
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone', phoneNumber)
        .single();

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      // Check if KYC record exists
      let { data: kyc } = await supabase
        .from('driver_kyc')
        .select('*')
        .eq('driver_id', driver.id)
        .single();

      const kycId = kyc?.id || uuidv4();
      const docStorageKey = `kyc/${driver.id}/${docType}_${Date.now()}`;

      // Update document in KYC record
      const updateData = {
        [`${docType}_doc_uri`]: fileUri,
        [`${docType}_doc_status`]: 'uploaded',
        [`${docType}_doc_uploaded_at`]: new Date(),
        updated_at: new Date(),
      };

      // Special handling for face scan - also update profile photo
      if (docType === 'faceScan') {
        updateData.profile_photo_doc_uri = fileUri;
        updateData.profile_photo_doc_status = 'uploaded';
        updateData.profile_photo_doc_uploaded_at = new Date();
      }

      if (kyc) {
        // Update existing KYC
        const { data: updatedKyc, error } = await supabase
          .from('driver_kyc')
          .update(updateData)
          .eq('id', kycId)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, kyc: updatedKyc });
      } else {
        // Create new KYC
        const { data: newKyc, error } = await supabase
          .from('driver_kyc')
          .insert({
            id: kycId,
            driver_id: driver.id,
            ...updateData,
            created_at: new Date(),
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, kyc: newKyc });
      }
    } catch (error) {
      console.error('KYC upload error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @POST /api/kyc/details
 * Save driver KYC details (Aadhaar, PAN, License numbers)
 */
router.post('/details',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        phoneNumber,
        aadhaarNumber,
        panNumber,
        licenseNumber,
        insuranceConsent,
      } = req.body;

      // Get driver
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone', phoneNumber)
        .single();

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      // Get or create KYC
      let { data: kyc } = await supabase
        .from('driver_kyc')
        .select('*')
        .eq('driver_id', driver.id)
        .single();

      const kycData = {
        aadhaar_number: aadhaarNumber,
        pan_number: panNumber,
        license_number: licenseNumber,
        insurance_consent: insuranceConsent,
        kyc_status: 'pending_verification',
        updated_at: new Date(),
      };

      if (kyc) {
        const { data: updatedKyc, error } = await supabase
          .from('driver_kyc')
          .update(kycData)
          .eq('id', kyc.id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, kyc: updatedKyc });
      } else {
        const { data: newKyc, error } = await supabase
          .from('driver_kyc')
          .insert({
            id: uuidv4(),
            driver_id: driver.id,
            ...kycData,
            created_at: new Date(),
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, kyc: newKyc });
      }
    } catch (error) {
      console.error('KYC details error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * @GET /api/kyc/driver/:phoneNumber
 * Get driver KYC details
 */
router.get('/driver/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    // Get driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('phone', phoneNumber)
      .single();

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Get KYC
    const { data: kyc } = await supabase
      .from('driver_kyc')
      .select('*')
      .eq('driver_id', driver.id)
      .single();

    res.json({ success: true, kyc: kyc || null });
  } catch (error) {
    console.error('KYC retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @POST /api/kyc/vehicle-details
 * Save vehicle details
 */
router.post('/vehicle-details',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        phoneNumber,
        company,
        model,
        purchaseDate,
        fuelType,
        ownershipType,
        ownerName,
        relationshipType,
        ownerAadhaarNumber,
        rcNumber,
        chassisNumber,
        insuranceName,
        insuranceNumber,
        puccExpiryDate,
      } = req.body;

      // Get driver
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('phone', phoneNumber)
        .single();

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      // Check if vehicle exists
      let { data: vehicle } = await supabase
        .from('vehicles')
        .select('*')
        .eq('driver_id', driver.id)
        .single();

      const vehicleData = {
        driver_id: driver.id,
        company,
        model,
        purchase_date: purchaseDate,
        fuel_type: fuelType,
        ownership_type: ownershipType,
        owner_name: ownerName,
        owner_relationship: relationshipType,
        owner_aadhaar_number: ownerAadhaarNumber,
        rc_number: rcNumber,
        chassis_number: chassisNumber,
        insurance_name: insuranceName,
        insurance_number: insuranceNumber,
        pucc_expiry_date: puccExpiryDate,
        updated_at: new Date(),
      };

      if (vehicle) {
        const { data: updatedVehicle, error } = await supabase
          .from('vehicles')
          .update(vehicleData)
          .eq('id', vehicle.id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, vehicle: updatedVehicle });
      } else {
        const { data: newVehicle, error } = await supabase
          .from('vehicles')
          .insert({
            id: uuidv4(),
            ...vehicleData,
            created_at: new Date(),
          })
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, vehicle: newVehicle });
      }
    } catch (error) {
      console.error('Vehicle details error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
