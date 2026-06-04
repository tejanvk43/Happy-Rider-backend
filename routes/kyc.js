/**
 * routes/kyc.js — Production KYC & Vehicle Upload Routes
 *
 * ARCHITECTURE:
 *  - Driver KYC docs → driver_kyc table (existing, per-column)
 *  - Vehicle docs    → vehicle_documents table (normalized, doc_type as string)
 *  - Vehicle photos  → vehicle_photos table (normalized, photo_type as string)
 *  - Vehicle text    → vehicles table (company, model, etc.)
 *
 * WHY normalized vehicle_documents:
 *   New doc types (permit, fitness, lease) need ZERO backend changes.
 *   The frontend config drives which types are needed.
 *
 * Routes:
 *   POST /api/kyc/upload                — driver identity doc upload
 *   POST /api/kyc/details               — driver doc numbers + consent
 *   POST /api/kyc/vehicle-upload        — vehicle compliance doc upload
 *   POST /api/kyc/vehicle-photo         — vehicle photo upload (new)
 *   POST /api/kyc/vehicle-details       — vehicle text fields
 *   GET  /api/kyc/driver/:phoneNumber   — get driver KYC status
 *   GET  /api/kyc/vehicle/:phoneNumber  — get vehicle + docs + photos (new)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const {
  uploadToSupabaseStorage,
  uploadVehicleDoc,
  uploadVehiclePhoto,
} = require('../config/storageService');
const upload = require('../middleware/upload');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helper: look up driver by phone
// ─────────────────────────────────────────────────────────────────────────────
async function getDriverByPhone(phoneNumber) {
  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, phone')
    .eq('phone', phoneNumber)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });
  if (!driver) throw Object.assign(new Error('Driver not found'), { statusCode: 404 });
  return driver;
}

// Helper: get or create vehicle row for driver
async function getOrCreateVehicle(driverId) {
  let { data: vehicle, error } = await supabase
    .from('vehicles')
    .select('id')
    .eq('driver_id', driverId)
    .maybeSingle();

  if (error) throw Object.assign(new Error(error.message), { statusCode: 500 });

  if (!vehicle) {
    const now = new Date().toISOString();
    const newId = uuidv4();
    const { error: insErr } = await supabase
      .from('vehicles')
      .insert({
        id: newId,
        driver_id: driverId,
        company: 'TBD',
        model: 'TBD',
        created_at: now,
        updated_at: now,
      });
    if (insErr) throw Object.assign(new Error(insErr.message), { statusCode: 500 });
    vehicle = { id: newId };
  }

  return vehicle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping: driver KYC docType → DB column prefix (driver_kyc table)
// ─────────────────────────────────────────────────────────────────────────────
const KYC_DOC_COLUMN_MAP = {
  profilePhoto: 'profile_photo_doc',
  aadhaar:      'aadhaar_doc',
  pan:          'pan_doc',
  license:      'license_doc',
  faceScan:     'face_scan_doc',
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/upload — Driver identity doc (aadhaar, pan, license, faceScan)
// Multipart/form-data: fields = { phoneNumber, docType } + file = "file"
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  upload.single('file'),
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('docType').isIn(Object.keys(KYC_DOC_COLUMN_MAP)),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });
    }

    const { phoneNumber, docType } = req.body;
    const columnPrefix = KYC_DOC_COLUMN_MAP[docType];

    console.log(`[KYC Upload] docType=${docType}, phone=${phoneNumber}, size=${req.file.size}B`);

    try {
      const driver = await getDriverByPhone(phoneNumber);

      const { publicUrl } = await uploadToSupabaseStorage(
        driver.id, docType, req.file.buffer, req.file.mimetype
      );

      const now = new Date().toISOString();
      const updatePayload = {
        [`${columnPrefix}_uri`]:         publicUrl,
        [`${columnPrefix}_status`]:      'uploaded',
        [`${columnPrefix}_uploaded_at`]: now,
        updated_at: now,
      };

      // faceScan also populates profile_photo_doc
      if (docType === 'faceScan') {
        updatePayload.profile_photo_doc_uri         = publicUrl;
        updatePayload.profile_photo_doc_status      = 'uploaded';
        updatePayload.profile_photo_doc_uploaded_at = now;
      }

      // Upsert driver_kyc row
      const { data: kyc } = await supabase
        .from('driver_kyc')
        .select('id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      if (kyc) {
        const { error } = await supabase.from('driver_kyc').update(updatePayload).eq('id', kyc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('driver_kyc').insert({
          id: uuidv4(), driver_id: driver.id, created_at: now, ...updatePayload,
        });
        if (error) throw error;
      }

      return res.json({ success: true, publicUrl, docType });

    } catch (err) {
      console.error(`[KYC Upload] Error for ${docType}:`, err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/details — Driver doc numbers + insurance consent
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/details',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { phoneNumber, aadhaarNumber, panNumber, licenseNumber, insuranceConsent } = req.body;

    try {
      const driver = await getDriverByPhone(phoneNumber);
      const now = new Date().toISOString();

      const kycData = {
        aadhaar_number:    aadhaarNumber  || null,
        pan_number:        panNumber       || null,
        license_number:    licenseNumber   || null,
        insurance_consent: !!insuranceConsent,
        kyc_status:        'pending_verification',
        updated_at:        now,
      };

      const { data: kyc } = await supabase.from('driver_kyc').select('id').eq('driver_id', driver.id).maybeSingle();

      if (kyc) {
        const { error } = await supabase.from('driver_kyc').update(kycData).eq('id', kyc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('driver_kyc').insert({ id: uuidv4(), driver_id: driver.id, created_at: now, ...kycData });
        if (error) throw error;
      }

      return res.json({ success: true, message: 'KYC details saved' });
    } catch (err) {
      console.error('[KYC Details]', err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/vehicle-upload
//
// Uploads a vehicle compliance document to Supabase Storage and stores the
// public URL in the normalized vehicle_documents table.
//
// Accepts: multipart/form-data
//   phoneNumber (string)
//   docType     (string) — any doc_type string from vehicleConfig: 'rc_doc', 'permit_doc', etc.
//   file        (binary image)
//
// WHY free docType string (not enum):
//   The frontend vehicleConfig drives what doc types are needed.
//   New doc types need ZERO backend changes.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/vehicle-upload',
  upload.single('file'),
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('docType')
    .notEmpty()
    .matches(/^[a-z0-9_]+$/).withMessage('docType must be lowercase alphanumeric with underscores'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded. Use field name "file".' });

    const { phoneNumber, docType } = req.body;
    console.log(`[Vehicle Upload] docType=${docType}, phone=${phoneNumber}, size=${req.file.size}B`);

    try {
      const driver = await getDriverByPhone(phoneNumber);
      const vehicle = await getOrCreateVehicle(driver.id);

      // Upload to Supabase Storage
      const { publicUrl, storagePath } = await uploadVehicleDoc(
        driver.id, vehicle.id, docType, req.file.buffer, req.file.mimetype
      );

      const now = new Date().toISOString();

      // Upsert into vehicle_documents table (normalized)
      const { error: docErr } = await supabase
        .from('vehicle_documents')
        .upsert({
          vehicle_id:   vehicle.id,
          doc_type:     docType,
          public_url:   publicUrl,
          storage_path: storagePath,
          status:       'uploaded',
          uploaded_at:  now,
          updated_at:   now,
        }, { onConflict: 'vehicle_id,doc_type' });

      if (docErr) throw docErr;

      return res.json({ success: true, publicUrl, docType, vehicleId: vehicle.id });

    } catch (err) {
      console.error(`[Vehicle Upload] Error for ${docType}:`, err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/vehicle-photo
//
// Uploads a vehicle angle photo (front, rear, number_plate, etc.)
// Stores in vehicle_photos table.
//
// Accepts: multipart/form-data
//   phoneNumber (string)
//   photoType   ('number_plate' | 'front' | 'rear' | 'left_side' | 'right_side')
//   file        (binary image)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_PHOTO_TYPES = ['number_plate', 'front', 'rear', 'left_side', 'right_side'];

router.post(
  '/vehicle-photo',
  upload.single('file'),
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  body('photoType').isIn(VALID_PHOTO_TYPES),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const { phoneNumber, photoType } = req.body;
    console.log(`[Vehicle Photo] photoType=${photoType}, phone=${phoneNumber}, size=${req.file.size}B`);

    try {
      const driver = await getDriverByPhone(phoneNumber);
      const vehicle = await getOrCreateVehicle(driver.id);

      const { publicUrl, storagePath } = await uploadVehiclePhoto(
        driver.id, vehicle.id, photoType, req.file.buffer, req.file.mimetype
      );

      const now = new Date().toISOString();

      const { error: photoErr } = await supabase
        .from('vehicle_photos')
        .upsert({
          vehicle_id:   vehicle.id,
          photo_type:   photoType,
          public_url:   publicUrl,
          storage_path: storagePath,
          uploaded_at:  now,
        }, { onConflict: 'vehicle_id,photo_type' });

      if (photoErr) throw photoErr;

      return res.json({ success: true, publicUrl, photoType, vehicleId: vehicle.id });

    } catch (err) {
      console.error(`[Vehicle Photo] Error for ${photoType}:`, err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/kyc/vehicle-details — Vehicle text fields
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/vehicle-details',
  body('phoneNumber').isMobilePhone('en-IN').trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      phoneNumber, vehicleCategory, company, model, purchaseDate, fuelType,
      registrationNumber, vehicleColor, chassisNumber, ownershipType,
      // Friends & family
      ownerName, ownerRelationship, ownerAadhaarNumber, ownerConsent,
      // Lease
      lessorName, lessorType, leaseManagerName, leaseManagerPhone, leaseConsent,
      // Insurance / PUCC / Permit
      insuranceName, insuranceNumber, puccExpiryDate,
      permitNumber, permitExpiryDate,
    } = req.body;

    try {
      const driver = await getDriverByPhone(phoneNumber);
      const now = new Date().toISOString();

      const vehicleData = {
        driver_id:             driver.id,
        vehicle_category:      vehicleCategory     || null,
        company:               company             || 'TBD',
        model:                 model               || 'TBD',
        purchase_date:         purchaseDate         || null,
        fuel_type:             fuelType             || null,
        registration_number:   registrationNumber   || null,
        vehicle_color:         vehicleColor         || null,
        chassis_number:        chassisNumber        || null,
        ownership_type:        ownershipType        || null,
        // Friends & family
        owner_name:            ownerName            || null,
        owner_relationship:    ownerRelationship    || null,
        owner_aadhaar_number:  ownerAadhaarNumber   || null,
        owner_consent:         !!ownerConsent,
        // Lease
        lessor_name:           lessorName           || null,
        lessor_type:           lessorType           || null,
        lease_manager_name:    leaseManagerName     || null,
        lease_manager_phone:   leaseManagerPhone    || null,
        lease_consent:         !!leaseConsent,
        // Insurance / PUCC / Permit
        insurance_name:        insuranceName        || null,
        insurance_number:      insuranceNumber      || null,
        pucc_expiry_date:      puccExpiryDate       || null,
        permit_number:         permitNumber         || null,
        permit_expiry_date:    permitExpiryDate     || null,
        updated_at:            now,
      };

      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      if (vehicle) {
        const { error } = await supabase.from('vehicles').update(vehicleData).eq('id', vehicle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicles').insert({ id: uuidv4(), created_at: now, ...vehicleData });
        if (error) throw error;
      }

      return res.json({ success: true, message: 'Vehicle details saved' });

    } catch (err) {
      console.error('[Vehicle Details]', err.message);
      return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kyc/driver/:phoneNumber — Full driver KYC status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/driver/:phoneNumber', async (req, res) => {
  try {
    const driver = await getDriverByPhone(req.params.phoneNumber);
    const { data: kyc } = await supabase
      .from('driver_kyc').select('*').eq('driver_id', driver.id).maybeSingle();
    return res.json({ success: true, kyc: kyc || null });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kyc/vehicle/:phoneNumber — Vehicle + all documents + photos
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicle/:phoneNumber', async (req, res) => {
  try {
    const driver = await getDriverByPhone(req.params.phoneNumber);

    const { data: vehicle } = await supabase
      .from('vehicles').select('*').eq('driver_id', driver.id).maybeSingle();

    if (!vehicle) return res.json({ success: true, vehicle: null, documents: [], photos: [] });

    const [{ data: documents }, { data: photos }] = await Promise.all([
      supabase.from('vehicle_documents').select('*').eq('vehicle_id', vehicle.id),
      supabase.from('vehicle_photos').select('*').eq('vehicle_id', vehicle.id),
    ]);

    return res.json({
      success: true,
      vehicle,
      documents: documents || [],
      photos: photos || [],
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
