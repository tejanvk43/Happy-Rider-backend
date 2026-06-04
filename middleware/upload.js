const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || 10485760, 10); // 10MB default
const ALLOWED_MIME_TYPES = process.env.ALLOWED_MIME_TYPES?.split(',') || [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/pdf',
];

// Configure storage
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

// Create multer instance
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

module.exports = upload;
