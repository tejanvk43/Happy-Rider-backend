const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import routes
const onboardingRoutes = require('./routes/onboarding');
const kycRoutes = require('./routes/kyc');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Middleware
// ========================

app.use(helmet());

// Better CORS setup for React Native + Expo
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
  limit: '50mb',
  extended: true,
}));

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

app.use('/api/health', healthRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/kyc', kycRoutes);

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
    `✓ Happi Riders backend running on PORT {PORT}`
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