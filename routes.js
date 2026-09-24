// ============================================================================
// API ROUTES — Express Router
const express = require('express');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { getDb } = require('./db');
const {
  generateUpiLink,
  generateQrCode,
  generateAppIntentLinks,
  generateWebhookSignature,
  verifyWebhookSignature,
  generatePaymentId,
  generateEventId
} = require('./upi');

const router = express.Router();

// ─── PRODUCTS ────────────────────────────────────────────────────────────────

router.get('/products', (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC').all();
  res.json({ success: true, data: products });
});

router.get('/products/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json({ success: true, data: product });
});

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────

router.post('/customers', (req, res) => {
  const db = getDb();
  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and email are required' });
  }

  const id = `cust_${uuidv4().split('-')[0]}`;

  // Upsert customer
  const existing = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE customers SET name = ?, phone = ?, updated_at = datetime("now") WHERE email = ?')
      .run(name, phone || null, email);
    return res.json({ success: true, data: existing, message: 'Customer updated' });
  }

  db.prepare('INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)')
    .run(id, name, email, phone || null);

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: customer });
});

router.get('/customers', (req, res) => {
  const db = getDb();
  const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
  res.json({ success: true, data: customers });
});

// ─── ORDERS — Phase 1: Create Order ─────────────────────────────────────────

router.post('/orders', async (req, res) => {
  const db = getDb();
  const { customer_id, customer_name, customer_email, customer_phone, items, notes } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ success: false, error: 'Order must have at least one item' });
  }

  // Resolve or create customer
  let custId = customer_id;
  if (!custId && customer_email) {
    let cust = db.prepare('SELECT * FROM customers WHERE email = ?').get(customer_email);
    if (!cust) {
      custId = `cust_${uuidv4().split('-')[0]}`;
      db.prepare('INSERT INTO customers (id, name, email, phone) VALUES (?, ?, ?, ?)')
        .run(custId, customer_name || 'Guest', customer_email, customer_phone || null);
    } else {
      custId = cust.id;
    }
  }

  // Calculate totals
  let totalAmount = 0;
  const resolvedItems = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.product_id);
    if (!product) {
      return res.status(400).json({ success: false, error: `Product ${item.product_id} not found` });
    }
    if (product.stock < (item.quantity || 1)) {
      return res.status(400).json({ success: false, error: `${product.name} is out of stock` });
    }
    const qty = item.quantity || 1;
    const lineTotal = product.price * qty;
    totalAmount += lineTotal;
    resolvedItems.push({
      product_id: product.id,
      quantity: qty,
      unit_price: product.price,
      total_price: lineTotal
    });
  }

  // Create order
  const orderId = `ord_${uuidv4().split('-')[0]}`;

  const createOrder = db.transaction(() => {
    db.prepare(`INSERT INTO orders (id, customer_id, total_amount, notes) VALUES (?, ?, ?, ?)`)
      .run(orderId, custId || null, totalAmount, notes || null);

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of resolvedItems) {
      insertItem.run(orderId, item.product_id, item.quantity, item.unit_price, item.total_price);
    }
  });

  createOrder();

  // Generate UPI payment link and QR
  const upiLink = generateUpiLink({ amount: totalAmount, orderId });
  let qrCode;
  try {
    qrCode = await generateQrCode(upiLink);
  } catch (e) {
    qrCode = null;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(`
    SELECT oi.*, p.name as product_name, p.image_url
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(orderId);

  res.status(201).json({
    success: true,
    data: {
      order,
      items: orderItems,
      payment: {
        upi_link: upiLink,
        app_links: generateAppIntentLinks({ amount: totalAmount, orderId }),
        qr_code: qrCode,
        merchant_upi_id: process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE',
        amount: totalAmount,
        currency: 'INR'
      }
    }
  });
});

// ─── GET ORDER DETAILS ──────────────────────────────────────────────────────

router.get('/orders/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.image_url
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(req.params.id);

  const customer = order.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id)
    : null;

  const events = db.prepare('SELECT * FROM payment_events WHERE order_id = ? ORDER BY created_at DESC').all(req.params.id);

  res.json({ success: true, data: { order, items, customer, events } });
});

// ─── LIST ORDERS (Dashboard) ────────────────────────────────────────────────

router.get('/orders', (req, res) => {
  const db = getDb();
  const { status, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT o.*, c.name as customer_name, c.email as customer_email
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
  `;
  const params = [];

  if (status) {
    query += ' WHERE o.status = ?';
    params.push(status);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const orders = db.prepare(query).all(...params);

  // Get counts
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'CREATED' THEN 1 ELSE 0 END) as created,
      SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) as refunded,
      SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as revenue
    FROM orders
  `).get();

  res.json({ success: true, data: { orders, counts } });
});

// ─── REGENERATE PAYMENT LINK ────────────────────────────────────────────────

router.post('/orders/:id/payment-link', async (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  if (order.status === 'PAID') {
    return res.status(400).json({ success: false, error: 'Order is already paid' });
  }

  const upiLink = generateUpiLink({ amount: order.total_amount, orderId: order.id });
  let qrCode;
  try {
    qrCode = await generateQrCode(upiLink);
  } catch (e) {
    qrCode = null;
  }

  res.json({
    success: true,
    data: {
      upi_link: upiLink,
      app_links: generateAppIntentLinks({ amount: order.total_amount, orderId: order.id }),
      qr_code: qrCode,
      merchant_upi_id: process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE',
      amount: order.total_amount,
      currency: 'INR'
    }
  });
});

// ─── WEBHOOK — Phase 2: Payment Confirmation ────────────────────────────────
// This endpoint receives payment confirmations.
// In production, this would be called by the payment gateway.
// For our self-hosted UPI system, we provide a manual confirmation + simulated webhook.

router.post('/webhook/payment', (req, res) => {
  const db = getDb();
  const signature = req.headers['x-webhook-signature'] || req.headers['x-payflow-signature'];
  const payload = req.body;

  const { event_id, order_id, payment_id, upi_transaction_id, status, amount } = payload;

  // 1. Validate required fields
  if (!order_id || !event_id) {
    return res.status(400).json({ success: false, error: 'Missing required fields: order_id, event_id' });
  }

  // 2. Signature Verification
  if (signature) {
    try {
      const payloadString = JSON.stringify(payload);
      const isValid = verifyWebhookSignature(payloadString, signature);
      if (!isValid) {
        console.warn(`⚠️  Invalid webhook signature for order ${order_id}`);
        return res.status(401).json({ success: false, error: 'Invalid signature' });
      }
    } catch (e) {
      console.warn(`⚠️  Signature verification error for order ${order_id}:`, e.message);
      return res.status(401).json({ success: false, error: 'Signature verification failed' });
    }
  }

  // 3. Idempotency check — has this event already been processed?
  const existingEvent = db.prepare('SELECT * FROM webhook_log WHERE event_id = ?').get(event_id);
  if (existingEvent && existingEvent.status === 'PROCESSED') {
    console.log(`ℹ️  Duplicate webhook event ${event_id} — already processed`);
    return res.json({ success: true, message: 'Event already processed', idempotent: true });
  }

  // 4. Verify order exists
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  // 5. Check if already paid (another idempotency layer)
  if (order.status === 'PAID') {
    // Log the duplicate attempt but don't reprocess
    db.prepare('INSERT OR IGNORE INTO webhook_log (event_id, order_id, status, processed_at) VALUES (?, ?, ?, datetime("now"))')
      .run(event_id, order_id, 'DUPLICATE');
    return res.json({ success: true, message: 'Order already paid', idempotent: true });
  }

  // 6. Process the payment event
  const processPayment = db.transaction(() => {
    // Log the event
    db.prepare(`
      INSERT INTO payment_events (order_id, event_type, payload, signature, verified, processed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      order_id,
      status || 'PAYMENT_SUCCESS',
      JSON.stringify(payload),
      signature || null,
      signature ? 1 : 0,
      1
    );

    // Log for idempotency
    db.prepare(`
      INSERT OR REPLACE INTO webhook_log (event_id, order_id, status, processed_at)
      VALUES (?, ?, 'PROCESSED', datetime('now'))
    `).run(event_id, order_id);

    // Update order status
    const newStatus = (status === 'PAYMENT_FAILED') ? 'FAILED' : 'PAID';
    db.prepare(`
      UPDATE orders
      SET status = ?, payment_id = ?, upi_transaction_id = ?, paid_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, payment_id || generatePaymentId(), upi_transaction_id || null, order_id);

    // Update stock for paid orders
    if (newStatus === 'PAID') {
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order_id);
      for (const item of items) {
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
      }
    }

    // Log notification (email stub)
    if (newStatus === 'PAID' && order.customer_id) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id);
      if (customer) {
        db.prepare(`
          INSERT INTO notifications (order_id, type, recipient, subject, body, status)
          VALUES (?, 'PAYMENT_CONFIRMATION', ?, ?, ?, 'QUEUED')
        `).run(
          order_id,
          customer.email,
          `Payment Confirmed — Order ${order_id}`,
          `Hi ${customer.name}, your payment of ₹${order.total_amount} for order ${order_id} has been confirmed.`
        );
      }
    }
  });

  processPayment();

  console.log(`✅ Payment processed for order ${order_id} — Event: ${event_id}`);

  res.json({
    success: true,
    message: 'Payment processed successfully',
    data: {
      order_id,
      payment_id: payment_id || null,
      status: 'PAID'
    }
  });
});

// ─── MANUAL PAYMENT CONFIRMATION (for self-hosted UPI) ──────────────────────
// Since we don't have a real gateway webhook, this endpoint lets the merchant
// manually confirm a payment after verifying it in their UPI app.

router.post('/orders/:id/confirm-payment', (req, res) => {
  const db = getDb();
  const { upi_transaction_id } = req.body;
  const orderId = req.params.id;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

  if (order.status === 'PAID') {
    return res.json({ success: true, message: 'Already marked as paid', data: order });
  }

  const paymentId = generatePaymentId();
  const eventId = generateEventId();

  // Create a webhook-like payload
  const webhookPayload = {
    event_id: eventId,
    order_id: orderId,
    payment_id: paymentId,
    upi_transaction_id: upi_transaction_id || null,
    status: 'PAYMENT_SUCCESS',
    amount: order.total_amount,
    timestamp: new Date().toISOString()
  };

  // Generate signature
  const signature = generateWebhookSignature(JSON.stringify(webhookPayload));

  // Process just like a real webhook would
  const processPayment = db.transaction(() => {
    db.prepare(`
      INSERT INTO payment_events (order_id, event_type, payload, signature, verified, processed)
      VALUES (?, 'PAYMENT_SUCCESS', ?, ?, 1, 1)
    `).run(orderId, JSON.stringify(webhookPayload), signature);

    db.prepare(`
      INSERT OR REPLACE INTO webhook_log (event_id, order_id, status, processed_at)
      VALUES (?, ?, 'PROCESSED', datetime('now'))
    `).run(eventId, orderId);

    db.prepare(`
      UPDATE orders
      SET status = 'PAID', payment_id = ?, upi_transaction_id = ?, paid_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(paymentId, upi_transaction_id || null, orderId);

    // Update stock
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    for (const item of items) {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
    }

    // Notification stub
    if (order.customer_id) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id);
      if (customer) {
        db.prepare(`
          INSERT INTO notifications (order_id, type, recipient, subject, body, status)
          VALUES (?, 'PAYMENT_CONFIRMATION', ?, ?, ?, 'QUEUED')
        `).run(
          orderId,
          customer.email,
          `Payment Confirmed — Order ${orderId}`,
          `Hi ${customer.name}, your payment of ₹${order.total_amount} for order ${orderId} has been confirmed.`
        );
      }
    }
  });

  processPayment();

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  res.json({
    success: true,
    message: 'Payment confirmed successfully',
    data: {
      order: updatedOrder,
      payment_id: paymentId,
      event_id: eventId,
      signature
    }
  });
});

// ─── RECEIPT ────────────────────────────────────────────────────────────────

router.get('/orders/:id/receipt', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  if (order.status !== 'PAID') return res.status(400).json({ success: false, error: 'Order is not paid yet' });

  const items = db.prepare(`
    SELECT oi.*, p.name as product_name
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(req.params.id);

  const customer = order.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(order.customer_id)
    : null;

  res.json({
    success: true,
    data: {
      receipt_id: `rcpt_${order.id.replace('ord_', '')}`,
      order,
      items,
      customer,
      merchant: {
        name: process.env.MERCHANT_NAME || 'PayFlow Store',
        upi_id: process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE'
      },
      generated_at: new Date().toISOString()
    }
  });
});

// ─── DASHBOARD STATS ────────────────────────────────────────────────────────

router.get('/dashboard/stats', (req, res) => {
  const db = getDb();

  const orderStats = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid_orders,
      SUM(CASE WHEN status = 'CREATED' THEN 1 ELSE 0 END) as pending_orders,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_orders,
      SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as total_revenue,
      AVG(CASE WHEN status = 'PAID' THEN total_amount END) as avg_order_value
    FROM orders
  `).get();

  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE active = 1').get();

  const recentOrders = db.prepare(`
    SELECT o.*, c.name as customer_name
    FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
    ORDER BY o.created_at DESC LIMIT 5
  `).all();

  const webhookStats = db.prepare(`
    SELECT
      COUNT(*) as total_events,
      SUM(CASE WHEN status = 'PROCESSED' THEN 1 ELSE 0 END) as processed,
      SUM(CASE WHEN status = 'DUPLICATE' THEN 1 ELSE 0 END) as duplicates
    FROM webhook_log
  `).get();

  res.json({
    success: true,
    data: {
      orders: orderStats,
      customers: customerCount.count,
      products: productCount.count,
      recent_orders: recentOrders,
      webhooks: webhookStats
    }
  });
});

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────

router.get('/notifications', (req, res) => {
  const db = getDb();
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50').all();
  res.json({ success: true, data: notifications });
});

// ─── PLACEHOLDER IMAGES ─────────────────────────────────────────────────────

router.get('/placeholder/:type', (req, res) => {
  const colors = {
    'earbuds': { bg: '6C5CE7', fg: 'FFFFFF', text: '🎧' },
    'laptop-sleeve': { bg: 'E17055', fg: 'FFFFFF', text: '💼' },
    'fitness-band': { bg: '00B894', fg: 'FFFFFF', text: '⌚' },
    'coffee': { bg: '2D3436', fg: 'FDCB6E', text: '☕' },
    'desk-lamp': { bg: 'FFEAA7', fg: '2D3436', text: '💡' },
    'backpack': { bg: '0984E3', fg: 'FFFFFF', text: '🎒' }
  };

  const config = colors[req.params.type] || { bg: '636E72', fg: 'FFFFFF', text: '📦' };

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <rect width="400" height="400" rx="20" fill="#${config.bg}"/>
      <text x="200" y="220" text-anchor="middle" font-size="120">${config.text}</text>
    </svg>
  `;

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(svg.trim());
});

module.exports = router;
