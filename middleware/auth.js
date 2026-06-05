/**
 * backend/middleware/auth.js
 *
 * JWT Authentication Middleware
 *
 * After successful OTP verification the backend issues a signed JWT.
 * This middleware validates the token on all protected routes and
 * attaches the driver identity (driverId, phone) to the request.
 *
 * Phone consistency check:
 *   If the request body or URL params contain a phoneNumber,
 *   it MUST match the phone embedded in the JWT. This prevents
 *   one authenticated user from modifying another user's data.
 */

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === 'your_jwt_secret_here') {
    console.error('[Auth] FATAL: JWT_SECRET is not configured.');
    return res.status(500).json({ success: false, error: 'Server misconfiguration' });
  }

  // ── Extract token ────────────────────────────────────────────────────────
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

    // Attach driver identity to request
    req.driverId = decoded.driverId;
    req.driverPhone = decoded.phone;

    // ── Phone consistency check ──────────────────────────────────────────
    // If the request provides a phoneNumber (body or URL param), ensure it
    // matches the authenticated session. Prevents cross-account access.
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
