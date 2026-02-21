const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2; // Ensure you run: npm install cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // Ensure you run: npm install multer-storage-cloudinary
const { requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

// 1. Configure Cloudinary
// Ensure these variables are set in your Render Environment Variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configure Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'pos_products', // This folder will be created in your Cloudinary media library
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Helper functions (remain unchanged)
const normalizeCategoryName = (name) => {
  if (!name) return '';
  return String(name).trim();
};

const normalizeBarcode = (barcode) => {
  if (barcode === undefined || barcode === null) return null;
  const normalized = String(barcode).trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveCategory = async (client, scopeUserId, categoryId, categoryNameInput) => {
  const categoryName = normalizeCategoryName(categoryNameInput);

  if (categoryId) {
    const byId = await client.query(
      'SELECT id, name FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, scopeUserId]
    );
    if (byId.rows.length === 0) {
      throw new Error('Selected category not found');
    }
    return { category_id: byId.rows[0].id, category: byId.rows[0].name };
  }

  if (!categoryName) {
    return { category_id: null, category: null };
  }

  const existing = await client.query(
    'SELECT id, name FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
    [scopeUserId, categoryName]
  );
  if (existing.rows.length > 0) {
    return { category_id: existing.rows[0].id, category: existing.rows[0].name };
  }

  const created = await client.query(
    'INSERT INTO categories (name, user_id) VALUES ($1, $2) RETURNING id, name',
    [categoryName, scopeUserId]
  );
  return { category_id: created.rows[0].id, category: created.rows[0].name };
};

// --- ROUTES ---

// Upload product image to Cloudinary
router.post('/upload-image', requireRoles('owner', 'manager'), upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    // Cloudinary returns the full permanent URL in req.file.path
    const imageUrl = req.file.path; 
    res.json({ image_url: imageUrl });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Get categories
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.created_at,
              COUNT(p.id)::int AS products_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [req.scopeUserId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create category
router.post('/categories', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const name = normalizeCategoryName(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const existing = await pool.query(
      'SELECT * FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
      [req.scopeUserId, name]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json(existing.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO categories (name, user_id) VALUES ($1, $2) RETURNING *`,
      [name, req.scopeUserId]
    );
    const category = result.rows[0];

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'create',
      entityType: 'category',
      entityId: category.id,
      newValues: { name: category.name },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update category
router.put('/categories/:id', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const name = normalizeCategoryName(req.body.name);

    if (!name) {
      return res.status(400).json({ error: 'Category name is required' });
    }

    const current = await pool.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const existing = await pool.query(
      'SELECT id FROM categories WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
      [req.scopeUserId, name, id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Category name already exists' });
    }

    const result = await pool.query(
      `UPDATE categories
       SET name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [name, id, req.scopeUserId]
    );

    await pool.query(
      `UPDATE products
       SET category = $1
       WHERE category_id = $2 AND user_id = $3`,
      [name, id, req.scopeUserId]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'update',
      entityType: 'category',
      entityId: Number(id),
      oldValues: current.rows[0],
      newValues: result.rows[0],
    });

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/categories/:id', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;

    const categoryResult = await pool.query(
      'SELECT * FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const inUse = await pool.query(
      'SELECT COUNT(*)::int AS total FROM products WHERE category_id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (inUse.rows[0].total > 0) {
      return res.status(400).json({ error: 'Category is in use by products' });
    }

    await pool.query('DELETE FROM categories WHERE id = $1 AND user_id = $2', [id, req.scopeUserId]);

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'delete',
      entityType: 'category',
      entityId: Number(id),
      oldValues: categoryResult.rows[0],
      reason: 'Category removed',
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get low stock products (uses per-product reorder_point, falls back to threshold param)
router.get('/low-stock', async (req, res) => {
  try {
    const threshold = req.query.threshold || 10;

    const result = await pool.query(
      `SELECT p.*, COALESCE(c.name, p.category) AS category
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.user_id = $1 AND p.stock_quantity <= COALESCE(p.reorder_point, $2)
       ORDER BY p.stock_quantity ASC`,
      [req.scopeUserId, threshold]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Manually adjust stock (add or remove)
router.post('/:id/adjust-stock', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body;

    const adj = Number(adjustment);
    if (isNaN(adj) || adj === 0) {
      return res.status(400).json({ error: 'adjustment must be a non-zero number' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const productResult = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];
    const newQty = Number(product.stock_quantity) + adj;
    if (newQty < 0) {
      return res.status(400).json({
        error: `Adjustment would result in negative stock (current: ${Number(product.stock_quantity)})`,
      });
    }

    const result = await pool.query(
      `UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 RETURNING *`,
      [newQty, id, req.scopeUserId]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'adjust_stock',
      entityType: 'product',
      entityId: id,
      oldValues: { stock_quantity: product.stock_quantity },
      newValues: { stock_quantity: newQty },
      reason: String(reason).trim(),
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adjusting stock:', error);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// Get all products
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, COALESCE(c.name, p.category) AS category
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.user_id = $1
       ORDER BY p.name ASC`,
      [req.scopeUserId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add new product
router.post('/', requireRoles('owner', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      barcode,
      description,
      price,
      cost_price,
      stock_quantity,
      unit,
      category,
      category_id,
      image_url,
    } = req.body;

    const VALID_UNITS = ['item', 'kg', 'litre', 'gram', 'ml'];
    const normalizedUnit = VALID_UNITS.includes(unit) ? unit : 'item';

    const resolvedCategory = await resolveCategory(client, req.scopeUserId, category_id, category);
    const normalizedBarcode = normalizeBarcode(barcode);

    const result = await client.query(
      `INSERT INTO products (
         name, barcode, description, price, cost_price, stock_quantity, unit, category, category_id, image_url, user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name,
        normalizedBarcode,
        description,
        price,
        cost_price || null,
        stock_quantity || 0,
        normalizedUnit,
        resolvedCategory.category,
        resolvedCategory.category_id,
        image_url,
        req.scopeUserId,
      ]
    );

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'create',
      entityType: 'product',
      entityId: result.rows[0].id,
      newValues: result.rows[0],
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding product:', error);
    if (error.code === '23505' && error.constraint === 'idx_products_user_barcode_unique') {
      return res.status(400).json({ error: 'Barcode already exists for another product' });
    }
    res.status(400).json({ error: error.message || 'Failed to add product' });
  } finally {
    client.release();
  }
});

// Update product
router.put('/:id', requireRoles('owner', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      barcode,
      description,
      price,
      cost_price,
      stock_quantity,
      unit,
      category,
      category_id,
      image_url,
    } = req.body;

    const oldProductResult = await client.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (oldProductResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const VALID_UNITS = ['item', 'kg', 'litre', 'gram', 'ml'];
    const normalizedUnit = VALID_UNITS.includes(unit) ? unit : (oldProductResult.rows[0].unit || 'item');
    
    const resolvedCategory = await resolveCategory(client, req.scopeUserId, category_id, category);
    const normalizedBarcode = normalizeBarcode(barcode);

    const result = await client.query(
      `UPDATE products 
       SET name = $1, barcode = $2, description = $3, price = $4, cost_price = $5, stock_quantity = $6, 
           unit = $7, category = $8, category_id = $9, image_url = $10, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $11 AND user_id = $12 RETURNING *`,
      [
        name,
        normalizedBarcode,
        description,
        price,
        cost_price || null,
        stock_quantity,
        normalizedUnit,
        resolvedCategory.category,
        resolvedCategory.category_id,
        image_url,
        id,
        req.scopeUserId,
      ]
    );
    
    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'update',
      entityType: 'product',
      entityId: id,
      oldValues: oldProductResult.rows[0],
      newValues: result.rows[0],
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    if (error.code === '23505' && error.constraint === 'idx_products_user_barcode_unique') {
      return res.status(400).json({ error: 'Barcode already exists for another product' });
    }
    res.status(400).json({ error: error.message || 'Failed to update product' });
  } finally {
    client.release();
  }
});

// Delete product
router.delete('/:id', requireRoles('owner'), async (req, res) => {
  try {
    const { id } = req.params;

    const oldProductResult = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND user_id = $2',
      [id, req.scopeUserId]
    );
    if (oldProductResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    await pool.query('DELETE FROM products WHERE id = $1 AND user_id = $2', [id, req.scopeUserId]);
    
    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'delete',
      entityType: 'product',
      entityId: id,
      oldValues: oldProductResult.rows[0],
      reason: 'Product removed',
    });
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;