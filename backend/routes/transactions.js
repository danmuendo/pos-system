const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const mpesaService = require('../services/mpesa');
const { requireRoles } = require('../middleware/auth');
const { logAudit } = require('../services/audit');

const getDayRange = (dateParam) => {
  const date = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getDateWindow = (dateFromParam, dateToParam) => {
  const end = dateToParam ? new Date(dateToParam) : new Date();
  if (Number.isNaN(end.getTime())) {
    return null;
  }

  const start = dateFromParam ? new Date(dateFromParam) : new Date(end);
  if (!dateFromParam) {
    start.setDate(start.getDate() - 29);
  }
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const fetchTransactionItems = async (client, transactionId) => {
  const itemsResult = await client.query(
    `SELECT product_id, product_name, quantity, unit_price, subtotal, unit
     FROM transaction_items
     WHERE transaction_id = $1`,
    [transactionId]
  );
  return itemsResult.rows;
};

const buildReceiptData = async (transactionId, scopeUserId) => {
  const result = await pool.query(
    `SELECT
       t.id,
       t.transaction_code,
       t.customer_phone,
       t.total_amount,
       t.discount_amount,
       t.status,
       t.payment_method,
       t.transaction_type,
       t.mpesa_receipt_number,
       t.created_at,
       t.completed_at,
       owner.business_name,
       owner.business_phone,
       owner.business_address,
       owner.business_tax_pin,
       owner.business_logo_url,
       owner.receipt_footer,
       cashier.username AS cashier_username,
       json_agg(
         json_build_object(
           'product_name', ti.product_name,
           'quantity', ti.quantity,
           'unit_price', ti.unit_price,
           'subtotal', ti.subtotal,
           'unit', ti.unit
         )
       ) AS items
     FROM transactions t
     LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
     LEFT JOIN users owner ON owner.id = t.user_id
     LEFT JOIN users cashier ON cashier.id = t.created_by_user_id
     WHERE t.id = $1 AND t.user_id = $2
     GROUP BY t.id, owner.business_name, owner.business_phone, owner.business_address, owner.business_tax_pin, owner.business_logo_url, owner.receipt_footer, cashier.username`,
    [transactionId, scopeUserId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const transaction = result.rows[0];
  const items = Array.isArray(transaction.items)
    ? transaction.items.filter((item) => item && item.product_name)
    : [];

  const receiptTimestamp = transaction.completed_at || transaction.created_at;

  return {
    transaction_id: transaction.id,
    transaction_code: transaction.transaction_code,
    receipt_date: receiptTimestamp,
    status: transaction.status,
    transaction_type: transaction.transaction_type || 'sale',
    payment_method: transaction.payment_method,
    customer_phone: transaction.customer_phone,
    mpesa_receipt_number: transaction.mpesa_receipt_number,
    business_name: transaction.business_name || 'POS System',
    business_phone: transaction.business_phone,
    business_address: transaction.business_address,
    business_tax_pin: transaction.business_tax_pin,
    business_logo_url: transaction.business_logo_url,
    receipt_footer: transaction.receipt_footer,
    cashier_name: transaction.cashier_username || 'system',
    total_amount: Number(transaction.total_amount),
    discount_amount: Number(transaction.discount_amount || 0),
    items: items.map((item) => ({
      product_name: item.product_name,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
      unit: item.unit || 'item',
    })),
  };
};

// Create new transaction and initiate M-Pesa payment
router.post('/checkout', async (req, res) => {
  const client = await pool.connect();

  try {
    const { customer_phone, items, payment_method = 'mpesa', discount_amount = 0 } = req.body;
    const normalizedPaymentMethod = String(payment_method).toLowerCase();

    if (!['mpesa', 'cash'].includes(normalizedPaymentMethod)) {
      return res.status(400).json({ error: 'payment_method must be mpesa or cash' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    if (normalizedPaymentMethod === 'mpesa' && (!customer_phone || customer_phone.length < 10)) {
      return res.status(400).json({ error: 'Customer phone is required for M-Pesa payments' });
    }

    await client.query('BEGIN');

    let totalAmount = 0;
    const transactionItems = [];

    for (const item of items) {
      const productResult = await client.query(
        'SELECT * FROM products WHERE id = $1 AND user_id = $2',
        [item.product_id, req.scopeUserId]
      );

      if (productResult.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found`);
      }

      const product = productResult.rows[0];
      const requestedQty = Number(item.quantity);
      if (isNaN(requestedQty) || requestedQty <= 0) {
        throw new Error(`Invalid quantity for ${product.name}`);
      }
      if (Number(product.stock_quantity) < requestedQty) {
        throw new Error(
          `Insufficient stock for ${product.name}. Available: ${Number(product.stock_quantity)}, Requested: ${requestedQty}`
        );
      }

      const subtotal = Number(product.price) * requestedQty;
      totalAmount += subtotal;

      transactionItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: requestedQty,
        unit_price: product.price,
        unit: product.unit || 'item',
        subtotal,
      });
    }

    const discountAmt = Math.max(0, Math.min(Number(discount_amount) || 0, totalAmount));
    const finalAmount = totalAmount - discountAmt;

    const transactionCode =
      'TXN' + Date.now() + Math.random().toString(36).substring(7).toUpperCase();

    const transactionResult = await client.query(
      `INSERT INTO transactions (
         transaction_code, customer_phone, total_amount, discount_amount, status, user_id,
         created_by_user_id, transaction_type, payment_method
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        transactionCode,
        normalizedPaymentMethod === 'cash' ? 'CASH' : customer_phone,
        finalAmount,
        discountAmt,
        normalizedPaymentMethod === 'cash' ? 'completed' : 'pending',
        req.scopeUserId,
        req.userId,
        'sale',
        normalizedPaymentMethod,
      ]
    );

    const transaction = transactionResult.rows[0];

    for (const item of transactionItems) {
      await client.query(
        `INSERT INTO transaction_items (
           transaction_id, product_id, product_name, quantity, unit_price, subtotal, unit
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          transaction.id,
          item.product_id,
          item.product_name,
          item.quantity,
          item.unit_price,
          item.subtotal,
          item.unit,
        ]
      );
    }

    if (normalizedPaymentMethod === 'cash') {
      for (const item of transactionItems) {
        await client.query(
          'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
          [item.quantity, item.product_id]
        );
      }

      await client.query(
        'UPDATE transactions SET completed_at = CURRENT_TIMESTAMP WHERE id = $1',
        [transaction.id]
      );

      await client.query('COMMIT');

      await logAudit({
        actorUserId: req.userId,
        scopeUserId: req.scopeUserId,
        action: 'create',
        entityType: 'transaction',
        entityId: transaction.id,
        newValues: {
          transaction_code: transactionCode,
          status: 'completed',
          total_amount: finalAmount,
          discount_amount: discountAmt,
          transaction_type: 'sale',
          payment_method: 'cash',
        },
      });

      return res.json({
        success: true,
        transaction_id: transaction.id,
        transaction_code: transactionCode,
        total_amount: finalAmount,
        discount_amount: discountAmt,
        payment_method: 'cash',
        message: 'Cash sale completed',
      });
    }

    await client.query('COMMIT');

    try {
      const mpesaResponse = await mpesaService.initiateSTKPush(
        customer_phone,
        totalAmount,
        transactionCode,
        'Payment for purchase'
      );

      await logAudit({
        actorUserId: req.userId,
        scopeUserId: req.scopeUserId,
        action: 'create',
        entityType: 'transaction',
        entityId: transaction.id,
        newValues: {
          transaction_code: transactionCode,
          status: 'pending',
          total_amount: finalAmount,
          discount_amount: discountAmt,
          transaction_type: 'sale',
          payment_method: 'mpesa',
        },
      });

      res.json({
        success: true,
        transaction_id: transaction.id,
        transaction_code: transactionCode,
        total_amount: finalAmount,
        discount_amount: discountAmt,
        payment_method: 'mpesa',
        mpesa_response: mpesaResponse,
        message: 'Payment prompt sent to customer phone',
      });
    } catch (mpesaError) {
      await pool.query('UPDATE transactions SET status = $1 WHERE id = $2', ['failed', transaction.id]);
      throw mpesaError;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Checkout error:', error);
    res.status(500).json({ error: error.message || 'Failed to process checkout' });
  } finally {
    client.release();
  }
});

// M-Pesa callback endpoint
router.post('/mpesa-callback', async (req, res) => {
  const client = await pool.connect();

  try {
    const { Body } = req.body;

    if (!Body || !Body.stkCallback) {
      return res.status(400).json({ error: 'Invalid callback data' });
    }

    const { ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

    let mpesaReceiptNumber = null;
    let phoneNumber = null;

    if (CallbackMetadata && CallbackMetadata.Item) {
      for (const item of CallbackMetadata.Item) {
        if (item.Name === 'MpesaReceiptNumber') {
          mpesaReceiptNumber = item.Value;
        }
        if (item.Name === 'PhoneNumber') {
          phoneNumber = String(item.Value);
        }
      }
    }

    await client.query('BEGIN');

    if (ResultCode === 0) {
      const transactionResult = await client.query(
        `UPDATE transactions
         SET status = 'completed', mpesa_receipt_number = $1, completed_at = CURRENT_TIMESTAMP
         WHERE customer_phone LIKE $2 AND status = 'pending' AND transaction_type = 'sale' AND payment_method = 'mpesa'
         RETURNING id, user_id`,
        [mpesaReceiptNumber, `%${phoneNumber}`]
      );

      if (transactionResult.rows.length > 0) {
        const transactionId = transactionResult.rows[0].id;
        const scopeUserId = transactionResult.rows[0].user_id;
        const items = await fetchTransactionItems(client, transactionId);

        for (const item of items) {
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }

        await logAudit({
          actorUserId: null,
          scopeUserId,
          action: 'complete',
          entityType: 'transaction',
          entityId: transactionId,
          newValues: {
            status: 'completed',
            mpesa_receipt_number: mpesaReceiptNumber,
          },
        });
      }
    } else {
      await client.query(
        `UPDATE transactions
         SET status = 'failed'
         WHERE customer_phone LIKE $1 AND status = 'pending' AND transaction_type = 'sale' AND payment_method = 'mpesa'`,
        [`%${phoneNumber}`]
      );
    }

    await client.query('COMMIT');
    res.json({ ResultCode: 0, ResultDesc: 'Callback received' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Callback error:', error);
    res.status(500).json({ error: 'Callback processing failed' });
  } finally {
    client.release();
  }
});

// Manual completion for testing
router.post('/:id/complete', async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const transactionResult = await client.query(
      `UPDATE transactions
       SET status = 'completed',
           mpesa_receipt_number = $1,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND status = 'pending' AND transaction_type = 'sale'
       RETURNING id`,
      ['MANUAL_' + Date.now(), id, req.scopeUserId]
    );

    if (transactionResult.rows.length === 0) {
      throw new Error('Transaction not found or already completed');
    }

    const items = await fetchTransactionItems(client, id);
    for (const item of items) {
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query('COMMIT');

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'complete',
      entityType: 'transaction',
      entityId: id,
      reason: 'Manual completion',
    });

    res.json({ success: true, message: 'Transaction completed and stock updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing transaction:', error);
    res.status(500).json({ error: error.message || 'Failed to complete transaction' });
  } finally {
    client.release();
  }
});

// Void transaction with reason and stock reversal
router.post('/:id/void', requireRoles('owner', 'manager'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Void reason is required' });
    }

    await client.query('BEGIN');

    const originalResult = await client.query(
      `SELECT * FROM transactions
       WHERE id = $1 AND user_id = $2 AND transaction_type = 'sale'`,
      [id, req.scopeUserId]
    );

    if (originalResult.rows.length === 0) {
      throw new Error('Original sale transaction not found');
    }

    const original = originalResult.rows[0];
    if (original.status !== 'completed') {
      throw new Error('Only completed sales can be voided');
    }

    if (original.reversed_by_transaction_id) {
      throw new Error('Transaction already reversed');
    }

    const reversalCode = `VOID${Date.now()}`;
    const reversalResult = await client.query(
      `INSERT INTO transactions (
         transaction_code, customer_phone, total_amount, status, user_id, created_by_user_id,
         transaction_type, parent_transaction_id, approval_reason, approved_by_user_id, completed_at, payment_method
       )
       VALUES ($1, $2, $3, 'completed', $4, $5, 'void', $6, $7, $8, CURRENT_TIMESTAMP, $9)
       RETURNING *`,
      [
        reversalCode,
        original.customer_phone,
        Number(original.total_amount) * -1,
        req.scopeUserId,
        req.userId,
        original.id,
        reason,
        req.userId,
        original.payment_method || 'mpesa',
      ]
    );

    const originalItems = await fetchTransactionItems(client, original.id);
    for (const item of originalItems) {
      await client.query(
        `INSERT INTO transaction_items (
           transaction_id, product_id, product_name, quantity, unit_price, subtotal, unit
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reversalResult.rows[0].id,
          item.product_id,
          item.product_name,
          item.quantity * -1,
          item.unit_price,
          item.subtotal * -1,
          item.unit || 'item',
        ]
      );

      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `UPDATE transactions
       SET status = 'voided', reversed_by_transaction_id = $1
       WHERE id = $2`,
      [reversalResult.rows[0].id, original.id]
    );

    await client.query('COMMIT');

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'void',
      entityType: 'transaction',
      entityId: original.id,
      oldValues: { status: 'completed' },
      newValues: { status: 'voided', reversed_by_transaction_id: reversalResult.rows[0].id },
      reason,
    });

    res.json({
      success: true,
      message: 'Transaction voided and stock restored',
      reversal_transaction: reversalResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Void transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to void transaction' });
  } finally {
    client.release();
  }
});

// Refund transaction with reason and stock reversal
router.post('/:id/refund', requireRoles('owner', 'manager'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Refund reason is required' });
    }

    await client.query('BEGIN');

    const originalResult = await client.query(
      `SELECT * FROM transactions
       WHERE id = $1 AND user_id = $2 AND transaction_type = 'sale'`,
      [id, req.scopeUserId]
    );

    if (originalResult.rows.length === 0) {
      throw new Error('Original sale transaction not found');
    }

    const original = originalResult.rows[0];
    if (original.status !== 'completed') {
      throw new Error('Only completed sales can be refunded');
    }

    if (original.reversed_by_transaction_id) {
      throw new Error('Transaction already reversed');
    }

    const reversalCode = `RFND${Date.now()}`;
    const reversalResult = await client.query(
      `INSERT INTO transactions (
         transaction_code, customer_phone, total_amount, status, user_id, created_by_user_id,
         transaction_type, parent_transaction_id, approval_reason, approved_by_user_id, completed_at, payment_method
       )
       VALUES ($1, $2, $3, 'completed', $4, $5, 'refund', $6, $7, $8, CURRENT_TIMESTAMP, $9)
       RETURNING *`,
      [
        reversalCode,
        original.customer_phone,
        Number(original.total_amount) * -1,
        req.scopeUserId,
        req.userId,
        original.id,
        reason,
        req.userId,
        original.payment_method || 'mpesa',
      ]
    );

    const originalItems = await fetchTransactionItems(client, original.id);
    for (const item of originalItems) {
      await client.query(
        `INSERT INTO transaction_items (
           transaction_id, product_id, product_name, quantity, unit_price, subtotal, unit
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reversalResult.rows[0].id,
          item.product_id,
          item.product_name,
          item.quantity * -1,
          item.unit_price,
          item.subtotal * -1,
          item.unit || 'item',
        ]
      );

      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `UPDATE transactions
       SET status = 'refunded', reversed_by_transaction_id = $1
       WHERE id = $2`,
      [reversalResult.rows[0].id, original.id]
    );

    await client.query('COMMIT');

    await logAudit({
      actorUserId: req.userId,
      scopeUserId: req.scopeUserId,
      action: 'refund',
      entityType: 'transaction',
      entityId: original.id,
      oldValues: { status: 'completed' },
      newValues: { status: 'refunded', reversed_by_transaction_id: reversalResult.rows[0].id },
      reason,
    });

    res.json({
      success: true,
      message: 'Transaction refunded and stock restored',
      reversal_transaction: reversalResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Refund transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to refund transaction' });
  } finally {
    client.release();
  }
});

// Shift close report
router.get('/reports/shift-close', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const range = getDayRange(req.query.date);
    if (!range) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE transaction_type = 'sale' AND status = 'completed') AS completed_sales_count,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed'), 0) AS gross_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'cash'), 0) AS cash_sales_total,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'mpesa'), 0) AS mpesa_sales_total,
         COUNT(*) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'cash') AS cash_sales_count,
         COUNT(*) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'mpesa') AS mpesa_sales_count,
         COUNT(*) FILTER (WHERE transaction_type = 'void') AS void_count,
         COALESCE(ABS(SUM(total_amount) FILTER (WHERE transaction_type = 'void')), 0) AS void_total,
         COUNT(*) FILTER (WHERE transaction_type = 'refund') AS refund_count,
         COALESCE(ABS(SUM(total_amount) FILTER (WHERE transaction_type = 'refund')), 0) AS refund_total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_count
       FROM transactions
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3`,
      [req.scopeUserId, range.start, range.end]
    );

    const cashiersResult = await pool.query(
      `SELECT u.username,
              COUNT(*) FILTER (WHERE t.transaction_type = 'sale' AND t.status = 'completed') AS sales_count,
              COALESCE(SUM(t.total_amount) FILTER (WHERE t.transaction_type = 'sale' AND t.status = 'completed'), 0) AS sales_total
       FROM transactions t
       LEFT JOIN users u ON u.id = t.created_by_user_id
       WHERE t.user_id = $1
         AND t.created_at >= $2
         AND t.created_at <= $3
       GROUP BY u.username
       ORDER BY sales_total DESC`,
      [req.scopeUserId, range.start, range.end]
    );

    const exceptionsResult = await pool.query(
      `SELECT id, transaction_code, status, transaction_type, payment_method, total_amount, created_at
       FROM transactions
       WHERE user_id = $1
         AND created_at >= $2
         AND created_at <= $3
         AND (
           status IN ('pending', 'failed') OR
           transaction_type IN ('void', 'refund')
         )
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.scopeUserId, range.start, range.end]
    );

    const summary = summaryResult.rows[0];
    const grossSales = Number(summary.gross_sales);
    const voidTotal = Number(summary.void_total);
    const refundTotal = Number(summary.refund_total);

    res.json({
      date: range.start.toISOString().slice(0, 10),
      summary: {
        completed_sales_count: Number(summary.completed_sales_count),
        gross_sales: grossSales,
        cash_sales_total: Number(summary.cash_sales_total),
        mpesa_sales_total: Number(summary.mpesa_sales_total),
        cash_sales_count: Number(summary.cash_sales_count),
        mpesa_sales_count: Number(summary.mpesa_sales_count),
        void_count: Number(summary.void_count),
        void_total: voidTotal,
        refund_count: Number(summary.refund_count),
        refund_total: refundTotal,
        pending_count: Number(summary.pending_count),
        failed_count: Number(summary.failed_count),
        net_sales: grossSales - voidTotal - refundTotal,
      },
      cashiers: cashiersResult.rows.map((row) => ({
        username: row.username || 'system',
        sales_count: Number(row.sales_count),
        sales_total: Number(row.sales_total),
      })),
      exceptions: exceptionsResult.rows,
    });
  } catch (error) {
    console.error('Shift close report error:', error);
    res.status(500).json({ error: 'Failed to generate shift close report' });
  }
});

// Product performance report (top-selling and low-margin)
router.get('/reports/product-performance', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const range = getDateWindow(req.query.date_from, req.query.date_to);
    if (!range) {
      return res.status(400).json({ error: 'Invalid dates. Use YYYY-MM-DD for date_from/date_to.' });
    }

    if (range.start > range.end) {
      return res.status(400).json({ error: 'date_from must be earlier than or equal to date_to.' });
    }

    const topSellingResult = await pool.query(
      `SELECT
         ti.product_id,
         ti.product_name,
         COALESCE(c.name, p.category) AS category,
         SUM(ti.quantity)::numeric AS quantity_sold,
         COALESCE(SUM(ti.subtotal), 0) AS revenue,
         COALESCE(p.unit, 'item') AS unit
       FROM transaction_items ti
       INNER JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id AND p.user_id = t.user_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE t.user_id = $1
         AND t.transaction_type = 'sale'
         AND t.status = 'completed'
         AND t.completed_at >= $2
         AND t.completed_at <= $3
       GROUP BY ti.product_id, ti.product_name, c.name, p.category, p.unit
       ORDER BY quantity_sold DESC, revenue DESC
       LIMIT 20`,
      [req.scopeUserId, range.start, range.end]
    );

    const lowMarginResult = await pool.query(
      `SELECT
         ti.product_id,
         ti.product_name,
         COALESCE(c.name, p.category) AS category,
         SUM(ti.quantity)::numeric AS quantity_sold,
         COALESCE(SUM(ti.subtotal), 0) AS revenue,
         COALESCE(p.cost_price, 0) AS cost_price,
         COALESCE(p.unit, 'item') AS unit,
         COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS estimated_cost,
         COALESCE(SUM(ti.subtotal), 0) - COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0) AS gross_profit,
         CASE
           WHEN COALESCE(SUM(ti.subtotal), 0) > 0 THEN
             ((COALESCE(SUM(ti.subtotal), 0) - COALESCE(SUM(ti.quantity * COALESCE(p.cost_price, 0)), 0))
               / COALESCE(SUM(ti.subtotal), 0)) * 100
           ELSE 0
         END AS margin_percent
       FROM transaction_items ti
       INNER JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id AND p.user_id = t.user_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE t.user_id = $1
         AND t.transaction_type = 'sale'
         AND t.status = 'completed'
         AND t.completed_at >= $2
         AND t.completed_at <= $3
         AND p.cost_price IS NOT NULL
       GROUP BY ti.product_id, ti.product_name, c.name, p.category, p.cost_price, p.unit
       HAVING SUM(ti.quantity) > 0
       ORDER BY margin_percent ASC, revenue DESC
       LIMIT 20`,
      [req.scopeUserId, range.start, range.end]
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(DISTINCT ti.product_id) AS products_sold_count,
         SUM(ti.quantity)::numeric AS total_quantity,
         COALESCE(SUM(ti.subtotal), 0) AS total_revenue
       FROM transaction_items ti
       INNER JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.user_id = $1
         AND t.transaction_type = 'sale'
         AND t.status = 'completed'
         AND t.completed_at >= $2
         AND t.completed_at <= $3`,
      [req.scopeUserId, range.start, range.end]
    );

    const missingCostResult = await pool.query(
      `SELECT COUNT(DISTINCT ti.product_id) AS count
       FROM transaction_items ti
       INNER JOIN transactions t ON t.id = ti.transaction_id
       LEFT JOIN products p ON p.id = ti.product_id AND p.user_id = t.user_id
       WHERE t.user_id = $1
         AND t.transaction_type = 'sale'
         AND t.status = 'completed'
         AND t.completed_at >= $2
         AND t.completed_at <= $3
         AND (p.cost_price IS NULL OR p.id IS NULL)`,
      [req.scopeUserId, range.start, range.end]
    );

    const slowMoversResult = await pool.query(
      `SELECT p.id, p.name, COALESCE(c.name, p.category) AS category,
              p.stock_quantity, p.price, COALESCE(p.unit, 'item') AS unit
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM transaction_items ti
           INNER JOIN transactions t ON t.id = ti.transaction_id
           WHERE ti.product_id = p.id
             AND t.user_id = p.user_id
             AND t.transaction_type = 'sale'
             AND t.status = 'completed'
             AND t.completed_at >= $2
             AND t.completed_at <= $3
         )
       ORDER BY p.name ASC
       LIMIT 50`,
      [req.scopeUserId, range.start, range.end]
    );

    res.json({
      date_from: range.start.toISOString().slice(0, 10),
      date_to: range.end.toISOString().slice(0, 10),
      summary: {
        products_sold_count: Number(summaryResult.rows[0]?.products_sold_count || 0),
        total_quantity: Number(summaryResult.rows[0]?.total_quantity || 0),
        total_revenue: Number(summaryResult.rows[0]?.total_revenue || 0),
      },
      missing_cost_price_count: Number(missingCostResult.rows[0]?.count || 0),
      top_selling: topSellingResult.rows.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category || '-',
        quantity_sold: Number(row.quantity_sold),
        revenue: Number(row.revenue),
        unit: row.unit || 'item',
      })),
      low_margin: lowMarginResult.rows.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category || '-',
        quantity_sold: Number(row.quantity_sold),
        revenue: Number(row.revenue),
        cost_price: Number(row.cost_price),
        estimated_cost: Number(row.estimated_cost),
        gross_profit: Number(row.gross_profit),
        margin_percent: Number(row.margin_percent),
        unit: row.unit || 'item',
      })),
      slow_movers: slowMoversResult.rows.map((row) => ({
        product_id: row.id,
        product_name: row.name,
        category: row.category || '-',
        stock_quantity: Number(row.stock_quantity || 0),
        price: Number(row.price || 0),
        unit: row.unit || 'item',
      })),
    });
  } catch (error) {
    console.error('Product performance report error:', error);
    res.status(500).json({ error: 'Failed to generate product performance report' });
  }
});

// Today's sales summary (owner/admin)
router.get('/reports/today-summary', requireRoles('owner', 'manager'), async (req, res) => {
  try {
    const range = getDayRange(null);
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE transaction_type = 'sale' AND status = 'completed') AS sales_count,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed'), 0) AS total_sales,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'cash'), 0) AS cash_total,
         COALESCE(SUM(total_amount) FILTER (WHERE transaction_type = 'sale' AND status = 'completed' AND payment_method = 'mpesa'), 0) AS mpesa_total,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COUNT(*) FILTER (WHERE transaction_type = 'void') AS void_count,
         COUNT(*) FILTER (WHERE transaction_type = 'refund') AS refund_count
       FROM transactions
       WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [req.scopeUserId, range.start, range.end]
    );
    const row = result.rows[0];
    res.json({
      date: range.start.toISOString().slice(0, 10),
      sales_count: Number(row.sales_count),
      total_sales: Number(row.total_sales),
      cash_total: Number(row.cash_total),
      mpesa_total: Number(row.mpesa_total),
      pending_count: Number(row.pending_count),
      void_count: Number(row.void_count),
      refund_count: Number(row.refund_count),
    });
  } catch (error) {
    console.error('Today summary error:', error);
    res.status(500).json({ error: 'Failed to fetch today summary' });
  }
});

// Get transaction history (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { payment_method, status, date_from, date_to } = req.query;

    const conditions = ['t.user_id = $1'];
    const params = [req.scopeUserId];
    let idx = 2;

    if (payment_method) {
      conditions.push(`t.payment_method = $${idx++}`);
      params.push(payment_method);
    }
    if (status) {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }
    if (date_from) {
      const d = new Date(date_from);
      d.setHours(0, 0, 0, 0);
      conditions.push(`t.created_at >= $${idx++}`);
      params.push(d);
    }
    if (date_to) {
      const d = new Date(date_to);
      d.setHours(23, 59, 59, 999);
      conditions.push(`t.created_at <= $${idx++}`);
      params.push(d);
    }

    const result = await pool.query(
      `SELECT t.*, u.username AS cashier_name,
              json_agg(
                json_build_object(
                  'product_name', ti.product_name,
                  'quantity', ti.quantity,
                  'unit_price', ti.unit_price,
                  'subtotal', ti.subtotal,
                  'unit', ti.unit
                )
              ) AS items
       FROM transactions t
       LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
       LEFT JOIN users u ON u.id = t.created_by_user_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY t.id, u.username
       ORDER BY t.created_at DESC
       LIMIT 200`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get receipt details for printing/reprinting
router.get('/:id/receipt', async (req, res) => {
  try {
    const receipt = await buildReceiptData(req.params.id, req.scopeUserId);
    if (!receipt) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(receipt);
  } catch (error) {
    console.error('Error fetching receipt data:', error);
    res.status(500).json({ error: 'Failed to fetch receipt data' });
  }
});

// Get single transaction
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT t.*,
              json_agg(
                json_build_object(
                  'product_name', ti.product_name,
                  'quantity', ti.quantity,
                  'unit_price', ti.unit_price,
                  'subtotal', ti.subtotal,
                  'unit', ti.unit
                )
              ) AS items
       FROM transactions t
       LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id`,
      [id, req.scopeUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

module.exports = router;
