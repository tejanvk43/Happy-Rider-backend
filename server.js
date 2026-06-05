const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import routes
const onboardingRoutes = require('./routes/onboarding');
const kycRoutes = require('./routes/kyc');
const healthRoutes = require('./routes/health');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Middleware
// ========================

app.use(helmet());

// CORS — allow React Native / Expo dev clients and the production app.
// React Native doesn't send an Origin header from native, so we must
// allow requests with no origin. In production this is safe because the
// JWT auth layer is the real access gate, not CORS.
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (React Native, mobile apps, curl)
    if (!origin) return callback(null, true);
    // Allow localhost dev servers
    const allowed = [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:19006',
    ];
    if (allowed.includes(origin)) return callback(null, true);
    // Block unexpected browser origins
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
  limit: '50mb',
  extended: true,
}));

// ========================
// Global Rate Limiter
// 100 requests per 15 minutes per IP
// ========================

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

app.use(globalLimiter);

// ========================
// JSON Parse Error Handler
// ========================

app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    'body' in err
  ) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON',
    });
  }

  next();
});

// ========================
// Request Logger
// ========================

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
  );

  next();
});

// ========================
// Routes
// ========================

// Health — public
app.use('/api/health', healthRoutes);

// Onboarding — mixed (phone + verify-otp are public, rest are protected)
// Auth is applied per-route inside onboarding.js
app.use('/api/onboarding', onboardingRoutes);

// KYC — ALL routes require authentication
app.use('/api/kyc', requireAuth, kycRoutes);

// ========================
// 404 Handler
// ========================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// ========================
// Global Error Handler
// ========================

app.use((error, req, res, next) => {
  console.error('Global Error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
    }),
  });
});

// ========================
// Start Server
// IMPORTANT:
// Use 0.0.0.0 for emulator/phone access
// ========================

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `✓ Happi Riders backend running on PORT ${PORT}`
  );

  console.log(
    `✓ Network URL: http://0.0.0.0:${PORT}`
  );

  console.log(
    `✓ Environment: ${process.env.NODE_ENV || 'development'}`
  );
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend reachable',
  });
});

module.exports = app;