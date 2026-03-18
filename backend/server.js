const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const transactionRoutes = require('./routes/transactions');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ════════════════════════════════════════════════════════════════════════════
// CORS Configuration - CRITICAL FOR PRODUCTION
// ════════════════════════════════════════════════════════════════════════════

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://pos-frontend-beta-gilt.vercel.app',
  'https://pos-frontend-git-main-danmuendos-projects.vercel.app',
  'https://pos-frontend-danmuendos-projects.vercel.app',
];

// Add any additional frontend URLs from environment variable
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Enable CORS with proper configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600 // Cache preflight requests for 10 minutes
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NOTE: Local 'uploads' logic removed. Images now handled via Cloudinary.

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'POS Backend is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// CORS test endpoint (useful for debugging)
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    message: 'CORS is working!',
    origin: req.headers.origin,
    allowedOrigins: allowedOrigins
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // CORS errors
  if (err.message.includes('CORS')) {
    return res.status(403).json({ 
      error: 'CORS policy violation',
      message: err.message 
    });
  }
  
  res.status(500).json({ 
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🚀 POS Backend server running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌍 Allowed Origins: ${allowedOrigins.length} configured`);
  console.log('═══════════════════════════════════════════════════════');
});

module.exports = app;
