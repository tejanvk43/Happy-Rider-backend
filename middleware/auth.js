/**
 * backend/middleware/auth.js
 *
 * Supabase JWT Authentication Middleware
 *
 * Verifies the Supabase-issued access token on protected routes.
 * Uses supabase.auth.getUser(token) — this validates the JWT signature
 * and returns the authenticated user's data.
 *
 * Sets req.supabaseUser, req.driverPhone on the request.
 * Also checks phone consistency if a phoneNumber is provided in the request.
 */

const supabase = require('../config/supabase');

async function requireAuth(req, res, next) {
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
    // Verify the Supabase JWT and get the user
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session. Please verify your phone number again.',
      });
    }

    // Attach user data to request
    req.supabaseUser = user;

    // Extract phone — Supabase stores as +919999999999, our DB stores as 9999999999
    const rawPhone = user.phone || '';
    req.driverPhone = rawPhone.startsWith('+91') ? rawPhone.slice(3) : rawPhone;

    // ── Phone consistency check ──────────────────────────────────────────
    const bodyPhone = req.body && req.body.phoneNumber;
    const paramPhone = req.params && req.params.phoneNumber;
    const requestPhone = bodyPhone || paramPhone;

    if (requestPhone && requestPhone !== req.driverPhone) {
      return res.status(403).json({
        success: false,
        error: 'Phone number does not match authenticated session.',
      });
    }

    next();
  } catch (err) {
    console.error('[Auth Middleware] Error verifying token:', err);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed.',
    });
  }
}

module.exports = { requireAuth };
