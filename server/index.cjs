const express = require('express');
const cors = require('cors');
const path = require('path');

// Initialize database (creates tables + seeds default user)
const db = require('./db.cjs');

const { router: authRouter, authMiddleware } = require('./auth.cjs');
const tasksRouter = require('./routes/tasks.cjs');
const dailyRouter = require('./routes/daily.cjs');
const timerRouter = require('./routes/timer.cjs');
const sleepRouter = require('./routes/sleep.cjs');
const reportsRouter = require('./routes/reports.cjs');
const friendsRouter = require('./routes/friends.cjs');
const adminRouter = require('./routes/admin.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow Vercel frontend and local dev
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Add custom frontend URL from env (set this in Railway to your Vercel URL)
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any *.vercel.app domain
    if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Auth routes (login is public)
app.use('/api/auth', authRouter);

// Protected routes — all require auth
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/daily', authMiddleware, dailyRouter);
app.use('/api/timer', authMiddleware, timerRouter);
app.use('/api/sleep', authMiddleware, sleepRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/friends', authMiddleware, friendsRouter);
app.use('/api/admin', authMiddleware, adminRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Planit API server running on http://0.0.0.0:${PORT}`);

  // Self-ping every 10 minutes to keep Render free tier alive
  if (process.env.RENDER_EXTERNAL_URL || process.env.RENDER) {
    const url = `${process.env.RENDER_EXTERNAL_URL || `http://0.0.0.0:${PORT}`}/health`;
    setInterval(() => {
      require('http').get(url.replace('https:', 'http:'), () => {}).on('error', () => {});
    }, 10 * 60 * 1000); // 10 minutes
    console.log('Self-ping enabled (every 10 min)');
  }
});

module.exports = app;
