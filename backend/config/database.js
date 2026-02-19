const { Pool } = require('pg');
require('dotenv').config();

// If DATABASE_URL is present (Neon/Cloud), use it. 
// Otherwise, fall back to your local individual variables.
const isProduction = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Used by Neon/Render
  
  // Fallback for local development
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'pos_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,

  // CRITICAL: Neon requires SSL for security
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('Database connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;