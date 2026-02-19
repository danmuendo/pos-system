const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const pool = require('../config/database');
const { authMiddleware, requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/audit');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage for logo uploads
const logoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pos_logos',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'limit' }]
  }
});

const uploadLogo = multer({
  storage: logoStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const buildToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      ownerUserId: user.owner_user_id,
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, business_name } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Allow open registration only for first account bootstrap.
    const usersCountResult = await pool.query('SELECT COUNT(*)::int AS total FROM users');
    const totalUsers = usersCountResult.rows[0]?.total || 0;
    if (totalUsers > 0) {
      return res.status(403).json({
        error: 'Registration is disabled. Ask your admin to create your account.',
      });
    }
    
    // Check if username already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, business_name, role, owner_user_id)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id, username, business_name, role, owner_user_id`,
      [username, passwordHash, business_name, 'admin']
    );

    const createdUser = result.rows[0];
    const ownerUpdate = await pool.query(
      'UPDATE users SET owner_user_id = $1 WHERE id = $1 RETURNING id, username, business_name, role, owner_user_id',
      [createdUser.id]
    );
    const user = ownerUpdate.rows[0];

    // Generate JWT token
    const token = buildToken(user);
    
    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        business_name: user.business_name,
        role: user.role,
        owner_user_id: user.owner_user_id,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = buildToken(user);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        business_name: user.business_name,
        role: user.role,
        owner_user_id: user.owner_user_id,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Create employee account under owner scope
router.post('/users', authMiddleware, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { username, password, role = 'cashier' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!['cashier', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be cashier or admin' });
    }

    // Admin can only create cashier accounts; only owner can create admin accounts
    if (role === 'admin' && req.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can create admin accounts' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const businessNameResult = await pool.query(
      'SELECT business_name FROM users WHERE id = $1',
      [req.ownerUserId]
    );

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, business_name, role, owner_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, business_name, role, owner_user_id, created_at`,
      [
        username,
        passwordHash,
        businessNameResult.rows[0]?.business_name || null,
        role,
        req.ownerUserId,
      ]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'create',
      entityType: 'user',
      entityId: result.rows[0].id,
      newValues: { username, role },
      reason: 'Employee account created',
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.get('/users', authMiddleware, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, role, created_at, owner_user_id
       FROM users
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [req.scopeUserId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/users/:id', authMiddleware, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, password } = req.body;

    const userResult = await pool.query(
      `SELECT id, username, role, owner_user_id
       FROM users
       WHERE id = $1 AND owner_user_id = $2`,
      [id, req.scopeUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];
    if (targetUser.id === req.userId && role && role !== targetUser.role) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    // Admin cannot edit admin accounts
    if (req.role === 'admin' && targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot edit other admin accounts' });
    }

    if (role && !['cashier', 'admin', 'owner'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (role === 'owner' && req.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can assign owner role' });
    }

    // Admin cannot promote anyone to admin
    if (role === 'admin' && req.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can assign admin role' });
    }

    if (username && username !== targetUser.username) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, id]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    const updates = [];
    const values = [];
    let index = 1;

    if (username) {
      updates.push(`username = $${index++}`);
      values.push(username);
    }
    if (role) {
      updates.push(`role = $${index++}`);
      values.push(role);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${index++}`);
      values.push(passwordHash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    values.push(id);
    values.push(req.scopeUserId);

    const result = await pool.query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${index++} AND owner_user_id = $${index}
       RETURNING id, username, role, created_at, owner_user_id`,
      values
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'update',
      entityType: 'user',
      entityId: Number(id),
      oldValues: targetUser,
      newValues: {
        username: result.rows[0].username,
        role: result.rows[0].role,
        password_updated: !!password,
      },
      reason: 'User account updated',
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', authMiddleware, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === req.userId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const userResult = await pool.query(
      `SELECT id, username, role
       FROM users
       WHERE id = $1 AND owner_user_id = $2`,
      [id, req.scopeUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];
    if (targetUser.role === 'owner' && req.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can delete owner account' });
    }

    // Admin cannot delete admin accounts
    if (req.role === 'admin' && targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Admins cannot delete other admin accounts' });
    }

    await pool.query(
      'DELETE FROM users WHERE id = $1 AND owner_user_id = $2',
      [id, req.scopeUserId]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'delete',
      entityType: 'user',
      entityId: Number(id),
      oldValues: targetUser,
      reason: 'User account deleted',
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('User delete error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.get('/business-profile', authMiddleware, requireRoles('owner', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT business_name, business_phone, business_address, business_tax_pin, business_logo_url, receipt_footer
       FROM users
       WHERE id = $1`,
      [req.scopeUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Business profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch business profile' });
  }
});

router.put('/business-profile', authMiddleware, requireRoles('owner'), async (req, res) => {
  try {
    const {
      business_name,
      business_phone,
      business_address,
      business_tax_pin,
      business_logo_url,
      receipt_footer,
    } =
      req.body;

    if (!business_name || !business_name.trim()) {
      return res.status(400).json({ error: 'Business name is required' });
    }

    const ownerResult = await pool.query(
      `UPDATE users
       SET business_name = $1,
           business_phone = $2,
           business_address = $3,
           business_tax_pin = $4,
           business_logo_url = $5,
           receipt_footer = $6
       WHERE id = $7
       RETURNING business_name, business_phone, business_address, business_tax_pin, business_logo_url, receipt_footer`,
      [
        business_name.trim(),
        business_phone?.trim() || null,
        business_address?.trim() || null,
        business_tax_pin?.trim() || null,
        business_logo_url?.trim() || null,
        receipt_footer?.trim() || null,
        req.scopeUserId,
      ]
    );

    await pool.query(
      `UPDATE users
       SET business_name = $1
       WHERE owner_user_id = $2`,
      [business_name.trim(), req.scopeUserId]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'update',
      entityType: 'business_profile',
      entityId: req.scopeUserId,
      newValues: ownerResult.rows[0],
      reason: 'Business profile updated',
    });

    res.json({
      message: 'Business profile updated successfully',
      profile: ownerResult.rows[0],
    });
  } catch (error) {
    console.error('Business profile update error:', error);
    res.status(500).json({ error: 'Failed to update business profile' });
  }
});

router.post(
  '/upload-logo',
  authMiddleware,
  requireRoles('owner'),
  uploadLogo.single('logo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No logo uploaded' });
      }

      // Cloudinary returns the full URL in req.file.path
      const logoUrl = req.file.path;
      await pool.query(
        'UPDATE users SET business_logo_url = $1 WHERE id = $2',
        [logoUrl, req.scopeUserId]
      );

      await logAudit({
        actorUserId: req.userId,
        scopeUserId: req.scopeUserId,
        action: 'update',
        entityType: 'business_profile',
        entityId: req.scopeUserId,
        newValues: { business_logo_url: logoUrl },
        reason: 'Business logo updated',
      });

      res.json({ business_logo_url: logoUrl });
    } catch (error) {
      console.error('Business logo upload error:', error);
      res.status(500).json({ error: 'Failed to upload business logo' });
    }
  }
);

router.delete('/logo', authMiddleware, requireRoles('owner'), async (req, res) => {
  try {
    await pool.query('UPDATE users SET business_logo_url = NULL WHERE id = $1', [req.scopeUserId]);

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'update',
      entityType: 'business_profile',
      entityId: req.scopeUserId,
      newValues: { business_logo_url: null },
      reason: 'Business logo removed',
    });

    res.json({ message: 'Business logo removed' });
  } catch (error) {
    console.error('Business logo remove error:', error);
    res.status(500).json({ error: 'Failed to remove business logo' });
  }
});

router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const userResult = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const matches = await bcrypt.compare(current_password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'password_change',
      entityType: 'user',
      entityId: req.userId,
      reason: 'Self-service password update',
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
