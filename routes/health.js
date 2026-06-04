const express = require('express');
const supabase = require('../config/supabase');

const router = express.Router();

/**
 * @GET /api/health
 * Health check endpoint
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

/**
 * @GET /api/health/db
 * Database health check
 */
router.get('/db', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('count()', { count: 'exact', head: true });

    if (error) throw error;

    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database health check error:', error);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
    });
  }
});

module.exports = router;
