'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const logger = require('./utils/logger');
const apiKeyAuth = require('./middleware/auth');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const healthRouter = require('./routes/health');
const ordersRouter = require('./routes/orders');
const feedbackRouter = require('./routes/feedback');
const { swaggerUi, specs } = require('./config/swagger');

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.disable('x-powered-by');

// ── Swagger Documentation ─────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests — please retry later.' },
});
app.use('/api/', limiter);

// ── Request parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

// ── HTTP request logging ──────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.path === '/health', // suppress health-check noise
  })
);

// ── Routes ────────────────────────────────────────────────────────────────────

// Public health check (no auth)
app.use('/health', healthRouter);

// All /api/* routes require API key
// app.use('/api', apiKeyAuth);  // must come after /health but before any /api/* routes: it 
app.use('/api/orders', ordersRouter);
app.use('/api/feedback', feedbackRouter);

// ── 404 & error handlers ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`ShopSmartExternalServer running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
