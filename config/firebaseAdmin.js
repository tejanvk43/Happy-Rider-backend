const admin = require('firebase-admin');
const { Buffer } = require('buffer');

/**
 * Initialize Firebase Admin SDK using a base64-encoded service account JSON
 * supplied in the environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`.
 *
 * If not provided, admin will remain uninitialized and verification endpoints
 * will return an error instructing the deployer to configure credentials.
 */
function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length > 0) return admin;

  const svcJsonBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!svcJsonBase64) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_JSON not set; Firebase Admin not initialized');
    return null;
  }

  try {
    const json = Buffer.from(svcJsonBase64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(json);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log('Firebase Admin initialized');
    return admin;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error.message || error);
    return null;
  }
}

module.exports = { initFirebaseAdmin };
