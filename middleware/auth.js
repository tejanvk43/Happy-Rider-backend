/**
 * backend/middleware/auth.js
 *
 * JWT Authentication Middleware
 *
 * Verifies the custom JWT issued after OTP verification.
 * Sets req.driverId and req.driverPhone on the request.
 * Checks phone consistency if a phoneNumber is in the request.
 */

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'your_jwt_secret_here') {
    console.error('[Auth] FATAL: JWT_SECRET is not configured.');
    return res.status(500).json({ success: false, error: 'Server misconfiguration' });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please verify your phone number first.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, secret);
    req.driverId = decoded.driverId;
    req.driverPhone = decoded.phone;

    // Phone consistency check
    const bodyPhone = req.body && req.body.phoneNumber;
    const paramPhone = req.params && req.params.phoneNumber;
    const requestPhone = bodyPhone || paramPhone;

    if (requestPhone && requestPhone !== decoded.phone) {
      return res.status(403).json({
        success: false,
        error: 'Phone number does not match authenticated session.',
      });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please verify your phone number again.',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.',
    });
  }
}

module.exports = { requireAuth };
