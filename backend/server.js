const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const transactionRoutes = require('./routes/transactions');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Dynamic CORS for production and local dev
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
];

// Add Vercel frontend URLs dynamically
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
} else {
  // Default Vercel production URLs
  allowedOrigins.push(
    'https://pos-frontend-beta-gilt.vercel.app',
    'https://pos-frontend-git-main-danmuendos-projects.vercel.app',
    'https://pos-frontend-danmuendos-projects.vercel.app'
  );
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NOTE: Local 'uploads' logic removed. Images now handled via Cloudinary.

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'POS Backend is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`POS Backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;