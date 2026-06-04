/**
 * upload.js  — Multer middleware configuration
 *
 * WHY memoryStorage:
 *  - Render has an ephemeral filesystem; writing to disk is unreliable.
 *  - We stream the buffer directly to Supabase Storage.
 *  - No temp file cleanup needed.
 *
 * WHY fileFilter:
 *  - Reject invalid MIME types BEFORE they hit any route handler.
 *  - Prevents PDFs, executables, etc. from being processed.
 *
 * WHY 5MB limit (not 10MB):
 *  - KYC document photos should be small for fast uploads on 4G.
 *  - 5MB is more than enough for a high-quality phone photo.
 */

const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error(`File type "${file.mimetype}" is not allowed. Use JPG or PNG.`),
        { statusCode: 400 }
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = upload;
