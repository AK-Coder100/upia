// ============================================================================
// DATABASE LAYER — SQLite with better-sqlite3
// ============================================================================
const Database = require('better-sqlite3');
const path = require('path');

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_PATH = isServerless
  ? path.join('/tmp', 'payflow.db')
  : path.join(__dirname, 'data', 'payflow.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
    seedProducts();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Products catalog
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      image_url TEXT,
      category TEXT,
      stock INTEGER DEFAULT 999,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      total_amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      status TEXT DEFAULT 'CREATED',
      payment_id TEXT,
      payment_method TEXT DEFAULT 'UPI',
      upi_transaction_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Order items (line items)
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Payment events log (webhook events)
    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      signature TEXT,
      verified INTEGER DEFAULT 0,
      processed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    -- Webhook delivery log (for idempotency)
    CREATE TABLE IF NOT EXISTS webhook_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT DEFAULT 'RECEIVED',
      attempts INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT
    );

    -- Email notifications log
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'PENDING',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (count.c > 0) return;

  const products = [
    {
      id: 'prod_001',
      name: 'Premium Wireless Earbuds',
      description: 'High-fidelity audio with active noise cancellation, 36-hour battery life, and IPX5 water resistance.',
      price: 2,
      category: 'Electronics',
      image_url: '/api/placeholder/earbuds',
      stock: 50
    },
    {
      id: 'prod_002',
      name: 'Leather Laptop Sleeve',
      description: 'Handcrafted genuine leather sleeve with magnetic closure. Fits 13-15 inch laptops.',
      price: 1,
      category: 'Accessories',
      image_url: '/api/placeholder/laptop-sleeve',
      stock: 30
    },
    {
      id: 'prod_003',
      name: 'Smart Fitness Band',
      description: 'Track heart rate, sleep, SpO2, and 30+ workout modes. 14-day battery life with AMOLED display.',
      price: 3,
      category: 'Electronics',
      image_url: '/api/placeholder/fitness-band',
      stock: 100
    },
    {
      id: 'prod_004',
      name: 'Organic Coffee Blend',
      description: 'Single-origin Arabica beans from Coorg, Karnataka. Medium roast, 250g pack.',
      price: 1.2,
      category: 'Food & Beverage',
      image_url: '/api/placeholder/coffee',
      stock: 200
    },
    {
      id: 'prod_005',
      name: 'Minimalist Desk Lamp',
      description: 'Touch-sensitive LED desk lamp with 5 brightness levels and USB-C charging port.',
      price: 1,
      category: 'Home & Office',
      image_url: '/api/placeholder/desk-lamp',
      stock: 45
    },
    {
      id: 'prod_006',
      name: 'Canvas Backpack',
      description: 'Durable waxed canvas backpack with padded laptop compartment. 25L capacity.',
      price: 2,
      category: 'Accessories',
      image_url: '/api/placeholder/backpack',
      stock: 60
    }
  ];

  const insert = db.prepare(`
    INSERT INTO products (id, name, description, price, category, image_url, stock)
    VALUES (@id, @name, @description, @price, @category, @image_url, @stock)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });

  insertMany(products);
}

module.exports = { getDb };
