/**
 * storageService.js
 *
 * Production-grade Supabase Storage upload helper.
 *
 * WHY THIS EXISTS:
 *  - Centralises all file upload logic in one place.
 *  - Prevents code duplication across KYC and vehicle routes.
 *  - Generates secure, unique, non-guessable paths per driver/doc type.
 *  - Always uses the service-role client so RLS doesn't block backend uploads.
 *
 * Bucket layout:
 *   kyc/
 *     <driver_id>/
 *       driver_docs/    ← driver KYC (aadhaar, pan, license, face_scan, profile_photo)
 *       vehicle_docs/   ← vehicle compliance docs (rc_doc, insurance_doc, permit_doc …)
 *       vehicle_photos/ ← vehicle angle photos (front, rear, number_plate …)
 */

const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const BUCKET_NAME = 'kyc';

// Map driver KYC docType → storage subfolder
const DRIVER_DOC_FOLDER_MAP = {
  profilePhoto: 'driver_docs/profile_photo',
  aadhaar:      'driver_docs/aadhaar',
  pan:          'driver_docs/pan',
  license:      'driver_docs/license',
  faceScan:     'driver_docs/face_scan',
};

// Allowed MIME types → file extensions
const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
};

/**
 * Validates uploaded file MIME type.
 * @param {string} mimetype
 * @throws {Error} if invalid
 */
function validateMimeType(mimetype) {
  if (!MIME_TO_EXT[mimetype]) {
    throw Object.assign(
      new Error(`Invalid file type "${mimetype}". Only JPG and PNG are allowed.`),
      { statusCode: 400 }
    );
  }
}

/**
 * Builds a unique, safe storage path.
 * Format: <driver_id>/<subfolder>/<timestamp>_<uuid>.<ext>
 *
 * WHY: Never trust the original filename from client.
 * Using UUID + timestamp makes paths unique and non-guessable.
 */
function buildPath(driverId, subfolder, mimetype) {
  const ext = MIME_TO_EXT[mimetype];
  const filename = `${Date.now()}_${uuidv4()}.${ext}`;
  return `${driverId}/${subfolder}/${filename}`;
}

/**
 * Upload a driver KYC document to Supabase Storage.
 *
 * @param {string}  driverId   - UUID of driver
 * @param {string}  docType    - Key from DRIVER_DOC_FOLDER_MAP (e.g. 'aadhaar')
 * @param {Buffer}  buffer     - File buffer from multer memoryStorage
 * @param {string}  mimetype   - Validated MIME type
 * @returns {Promise<{publicUrl: string, storagePath: string}>}
 */
async function uploadDriverDoc(driverId, docType, buffer, mimetype) {
  validateMimeType(mimetype);

  const subfolder = DRIVER_DOC_FOLDER_MAP[docType];
  if (!subfolder) {
    throw Object.assign(
      new Error(`Unknown driver docType: "${docType}"`),
      { statusCode: 400 }
    );
  }

  const storagePath = buildPath(driverId, subfolder, mimetype);
  return _upload(storagePath, buffer, mimetype);
}

/**
 * Upload a vehicle compliance document (rc_doc, insurance_doc, permit_doc, etc.)
 *
 * WHY free docType string:
 *   The config engine sends any doc_type string it wants (e.g. 'rc_doc', 'permit_doc').
 *   New doc types never need code changes here — the subfolder is always vehicle_docs.
 *
 * @param {string}  driverId   - UUID of driver
 * @param {string}  vehicleId  - UUID of vehicle (used in path for uniqueness)
 * @param {string}  docType    - Any doc type string ('rc_doc', 'insurance_doc', etc.)
 * @param {Buffer}  buffer
 * @param {string}  mimetype
 */
async function uploadVehicleDoc(driverId, vehicleId, docType, buffer, mimetype) {
  validateMimeType(mimetype);

  // Sanitize docType: only alphanumeric + underscores allowed in path
  const safeDocType = docType.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const storagePath = buildPath(driverId, `vehicle_docs/${vehicleId}/${safeDocType}`, mimetype);
  return _upload(storagePath, buffer, mimetype);
}

/**
 * Upload a vehicle photo (front, rear, number_plate, etc.)
 *
 * @param {string}  driverId
 * @param {string}  vehicleId
 * @param {string}  photoType  - 'front' | 'rear' | 'left_side' | 'right_side' | 'number_plate'
 * @param {Buffer}  buffer
 * @param {string}  mimetype
 */
async function uploadVehiclePhoto(driverId, vehicleId, photoType, buffer, mimetype) {
  validateMimeType(mimetype);

  const safePhotoType = photoType.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const storagePath = buildPath(driverId, `vehicle_photos/${vehicleId}/${safePhotoType}`, mimetype);
  return _upload(storagePath, buffer, mimetype);
}

// ─── Backward-compatible alias used by old kyc.js driver KYC route ───────────
// This accepts the old docType keys (profilePhoto, aadhaar, pan, license, faceScan)
async function uploadToSupabaseStorage(driverId, docType, buffer, mimetype) {
  return uploadDriverDoc(driverId, docType, buffer, mimetype);
}

// ─── Internal upload + URL generation ────────────────────────────────────────
async function _upload(storagePath, buffer, mimetype) {
  console.log(`[Storage] Uploading → ${storagePath}`);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: mimetype,
      upsert: true, // Allow re-upload of same doc type (e.g. user retakes photo)
    });

  if (uploadError) {
    console.error(`[Storage] Upload failed for ${storagePath}:`, uploadError.message);
    throw Object.assign(
      new Error(`Storage upload failed: ${uploadError.message}`),
      { statusCode: 500 }
    );
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  if (!urlData?.publicUrl) {
    throw Object.assign(
      new Error('Failed to generate public URL after upload.'),
      { statusCode: 500 }
    );
  }

  console.log(`[Storage] Upload success → ${urlData.publicUrl}`);
  return { publicUrl: urlData.publicUrl, storagePath };
}

module.exports = {
  uploadToSupabaseStorage,   // backward compat
  uploadDriverDoc,
  uploadVehicleDoc,
  uploadVehiclePhoto,
  MIME_TO_EXT,
};
