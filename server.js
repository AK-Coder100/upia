// ============================================================================
// SERVER — Express Application Entry Point
// ============================================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const apiRoutes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logging ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api/')) {
      console.log(`${req.method} ${req.path} — ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ─── Static Files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── SPA Fallback ───────────────────────────────────────────────────────────
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║   ⚡ PayFlow — UPI Payment Gateway                          ║');
  console.log('║                                                              ║');
  console.log(`║   🌐 Server:    http://localhost:${PORT}                       ║`);
  console.log(`║   📡 API:       http://localhost:${PORT}/api                   ║`);
  console.log(`║   🏪 UPI ID:    ${(process.env.MERCHANT_UPI_ID || 'aman.ag295@okaxis').padEnd(39)}║`);
  console.log('║                                                              ║');
  console.log('║   Endpoints:                                                 ║');
  console.log('║   GET  /api/products         — Product catalog               ║');
  console.log('║   POST /api/orders           — Create order + payment link   ║');
  console.log('║   POST /api/webhook/payment  — Webhook (payment confirm)     ║');
  console.log('║   GET  /api/dashboard/stats  — Dashboard statistics          ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
