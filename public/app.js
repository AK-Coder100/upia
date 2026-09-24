// ============================================================================
// PayFlow — Frontend Application
// Self-hosted UPI Payment Gateway with Two-Phase Verification
// ============================================================================

const API = '/api';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  products: [],
  cart: [],
  currentOrder: null,
  currentPage: 'store'
};

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function api(endpoint, options = {}) {
  try {
    const res = await fetch(`${API}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigateTo(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Show target page
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  // Update nav links
  document.querySelectorAll('.nav-link[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === page);
  });

  state.currentPage = page;

  // Load page data
  switch (page) {
    case 'store': loadProducts(); break;
    case 'dashboard': loadDashboard(); break;
    case 'orders': loadOrders(); break;
    case 'architecture': renderArchitecture(); break;
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Products ─────────────────────────────────────────────────────────────────

async function loadProducts() {
  const grid = document.getElementById('product-grid');
  try {
    const res = await api('/products');
    state.products = res.data;
    renderProducts();
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">😵</div>
        <h3>Failed to load products</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="loadProducts()" style="margin-top: 16px">Retry</button>
      </div>
    `;
  }
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  if (!state.products.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <h3>No products yet</h3>
        <p>Products will appear here</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.products.map(p => `
    <div class="product-card" onclick="viewProduct('${p.id}')">
      <img src="${p.image_url}" alt="${p.name}" class="product-image" loading="lazy">
      <div class="product-body">
        <span class="product-category">${p.category}</span>
        <h3 class="product-name">${p.name}</h3>
        <p class="product-desc">${p.description}</p>
        <div class="product-footer">
          <span class="product-price">${formatPrice(p.price)}</span>
          <span class="product-stock">${p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</span>
        </div>
        <button class="btn btn-primary btn-block" style="margin-top: 16px" onclick="event.stopPropagation(); addToCart('${p.id}')">
          Add to Cart
        </button>
      </div>
    </div>
  `).join('');
}

function viewProduct(id) {
  // Just add to cart for now
  addToCart(id);
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  const existing = state.cart.find(item => item.product_id === productId);
  if (existing) {
    existing.quantity++;
  } else {
    state.cart.push({
      product_id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      quantity: 1
    });
  }

  updateCartUI();
  showToast(`${product.name} added to cart`, 'success');
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(item => item.product_id !== productId);
  updateCartUI();
}

function updateCartQuantity(productId, delta) {
  const item = state.cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(productId);
  } else {
    updateCartUI();
  }
}

function updateCartUI() {
  const badge = document.getElementById('cart-count');
  const body = document.getElementById('cart-body');
  const footer = document.getElementById('cart-footer');
  const totalEl = document.getElementById('cart-total-amount');

  const totalItems = state.cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = state.cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  // Badge
  if (totalItems > 0) {
    badge.style.display = 'flex';
    badge.textContent = totalItems;
  } else {
    badge.style.display = 'none';
  }

  // Cart body
  if (state.cart.length === 0) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="icon">🛒</div>
        <p>Your cart is empty</p>
      </div>
    `;
    footer.style.display = 'none';
  } else {
    body.innerHTML = state.cart.map(item => `
      <div class="cart-item">
        <img src="${item.image_url}" alt="${item.name}" class="cart-item-image">
        <div class="cart-item-info">
          <div class="name">${item.name}</div>
          <div class="price">₹${formatPrice(item.price * item.quantity)}</div>
        </div>
        <div class="cart-item-qty">
          <button onclick="updateCartQuantity('${item.product_id}', -1)">−</button>
          <span class="qty-value">${item.quantity}</span>
          <button onclick="updateCartQuantity('${item.product_id}', 1)">+</button>
        </div>
      </div>
    `).join('');
    footer.style.display = 'block';
    totalEl.textContent = `₹${formatPrice(totalAmount)}`;
  }
}

function toggleCart() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');
  overlay.classList.toggle('active');
  drawer.classList.toggle('active');
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

function proceedToCheckout() {
  if (state.cart.length === 0) {
    showToast('Your cart is empty', 'warning');
    return;
  }
  toggleCart(); // Close cart
  renderCheckoutPage();
  navigateTo('checkout');
}

function renderCheckoutPage() {
  const layout = document.getElementById('checkout-layout');
  const totalAmount = state.cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);

  layout.innerHTML = `
    <div class="checkout-form">
      <div class="card" style="margin-bottom: 24px">
        <h3 style="margin-bottom: 20px; font-weight: 700;">Customer Details</h3>
        <div class="form-group">
          <label for="cust-name">Full Name *</label>
          <input type="text" id="cust-name" placeholder="Enter your full name" required>
        </div>
        <div class="form-group">
          <label for="cust-email">Email Address *</label>
          <input type="email" id="cust-email" placeholder="you@example.com" required>
        </div>
        <div class="form-group">
          <label for="cust-phone">Phone Number</label>
          <input type="tel" id="cust-phone" placeholder="+91 98765 43210">
        </div>
        <div class="form-group">
          <label for="order-notes">Order Notes (optional)</label>
          <textarea id="order-notes" placeholder="Any special instructions..." rows="3"></textarea>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-bottom: 16px; font-weight: 700;">Order Summary</h3>
        ${state.cart.map(item => `
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
            <span style="color: var(--text-secondary);">${item.name} × ${item.quantity}</span>
            <span style="font-weight: 600;">₹${formatPrice(item.price * item.quantity)}</span>
          </div>
        `).join('')}
        <div style="display: flex; justify-content: space-between; padding: 16px 0; font-size: 1.2rem; font-weight: 800;">
          <span>Total</span>
          <span style="color: var(--success);">₹${formatPrice(totalAmount)}</span>
        </div>
        <button class="btn btn-primary btn-block btn-lg" onclick="createOrder()" id="btn-create-order">
          🔒 Create Order & Pay via UPI
        </button>
      </div>
    </div>

    <div class="payment-panel">
      <div style="padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 16px;">🔐</div>
        <h3 style="margin-bottom: 8px; color: var(--text-secondary);">Secure UPI Payment</h3>
        <p style="font-size: 0.85rem;">Fill in your details and click "Create Order" to generate your UPI payment QR code.</p>
        <div class="flow-steps" style="margin-top: 24px; text-align: left;">
          <div class="flow-step">
            <div class="step-num">1</div>
            <div class="step-content">
              <h4>Create Order</h4>
              <p>We generate a unique order ID and UPI payment link</p>
            </div>
          </div>
          <div class="flow-step">
            <div class="step-num">2</div>
            <div class="step-content">
              <h4>Scan & Pay</h4>
              <p>Scan the QR code with any UPI app to pay</p>
            </div>
          </div>
          <div class="flow-step">
            <div class="step-num">3</div>
            <div class="step-content">
              <h4>Confirmation</h4>
              <p>Payment is verified and your receipt is generated</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function createOrder() {
  const name = document.getElementById('cust-name').value.trim();
  const email = document.getElementById('cust-email').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const notes = document.getElementById('order-notes').value.trim();

  if (!name || !email) {
    showToast('Please enter your name and email', 'warning');
    return;
  }

  const btn = document.getElementById('btn-create-order');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Creating Order...';

  try {
    const res = await api('/orders', {
      method: 'POST',
      body: {
        customer_name: name,
        customer_email: email,
        customer_phone: phone,
        notes: notes,
        items: state.cart.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      }
    });

    state.currentOrder = res.data;
    state.cart = []; // Clear cart
    updateCartUI();

    showToast('Order created successfully!', 'success');
    renderPaymentPage(res.data);
    navigateTo('payment');

  } catch (err) {
    showToast(`Failed to create order: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = '🔒 Create Order & Pay via UPI';
  }
}

// ─── Payment Page ─────────────────────────────────────────────────────────────

function renderPaymentPage(orderData) {
  const content = document.getElementById('payment-content');
  const { order, items, payment } = orderData;

  // Start a 15-minute timer
  let timeLeft = 15 * 60; // 15 minutes

  content.innerHTML = `
    <div style="max-width: 900px; margin: 0 auto;">
      <div class="page-header" style="text-align: center;">
        <h1>Complete Your Payment</h1>
        <p>Scan the QR code below with any UPI app to pay</p>
      </div>

      <div class="checkout-layout" style="grid-template-columns: 1fr 1fr;">
        <!-- Left: Order Info -->
        <div>
          <div class="card" style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
              📋 Order Details
              <span class="status-badge created">Created</span>
            </h3>
            <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent-primary); margin-bottom: 16px;">
              ${order.id}
            </div>
            ${items.map(item => `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                <span style="color: var(--text-secondary);">${item.product_name} × ${item.quantity}</span>
                <span style="font-weight: 600;">₹${formatPrice(item.total_price)}</span>
              </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; padding: 12px 0; font-weight: 800; font-size: 1.1rem;">
              <span>Total</span>
              <span style="color: var(--success);">₹${formatPrice(order.total_amount)}</span>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-bottom: 12px; font-weight: 700;">💡 How to Pay</h3>
            <div class="flow-steps" style="margin: 0;">
              <div class="flow-step active">
                <div class="step-num">1</div>
                <div class="step-content">
                  <h4>Open your UPI app</h4>
                  <p>Google Pay, PhonePe, Paytm, or any UPI app</p>
                </div>
              </div>
              <div class="flow-step">
                <div class="step-num">2</div>
                <div class="step-content">
                  <h4>Scan the QR code</h4>
                  <p>Or copy the UPI ID and pay manually</p>
                </div>
              </div>
              <div class="flow-step">
                <div class="step-num">3</div>
                <div class="step-content">
                  <h4>Confirm payment</h4>
                  <p>Click "I've Paid" below after completing payment</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Payment Panel -->
        <div class="payment-panel">
          <div class="amount-display">${formatPrice(payment.amount)}</div>
          <p style="color: var(--text-muted); font-size: 0.85rem;">Amount to pay</p>

          <div class="qr-container">
            ${payment.qr_code
              ? `<img src="${payment.qr_code}" alt="UPI QR Code" width="280" height="280">`
              : '<p style="color: #666; padding: 40px;">QR code unavailable</p>'
            }
          </div>

          <div class="upi-id-display">
            <span>UPI:</span>
            <strong>${payment.merchant_upi_id}</strong>
            <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${payment.merchant_upi_id}')" title="Copy UPI ID">📋</button>
          </div>

          <div class="payment-apps">
            <a href="${payment.upi_link}" class="app-btn">📱 Open UPI App</a>
            <button class="app-btn" onclick="copyToClipboard('${payment.upi_link}')">🔗 Copy Link</button>
          </div>

          <div class="timer-ring animate-pulse" id="payment-timer">
            ⏱️ <span id="timer-display">15:00</span> remaining
          </div>

          <div class="payment-status waiting" id="payment-status">
            <span class="animate-pulse">⏳</span> Waiting for payment...
          </div>

          <div class="section-divider" style="margin: 20px 0 16px;">After payment</div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div class="form-group" style="margin: 0; text-align: left;">
              <label style="font-size: 0.8rem; color: var(--text-muted);">UPI Transaction ID (optional)</label>
              <input type="text" id="upi-txn-id" placeholder="e.g. 326419876543" style="width: 100%; padding: 10px 14px; background: var(--bg-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-family: var(--font-mono); font-size: 0.85rem;">
            </div>
            <button class="btn btn-success btn-block btn-lg" onclick="confirmPayment('${order.id}')" id="btn-confirm-payment">
              ✅ I've Completed the Payment
            </button>
            <button class="btn btn-ghost btn-block" onclick="navigateTo('store')">
              ← Back to Store
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Start countdown timer
  const timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      document.getElementById('timer-display').textContent = 'EXPIRED';
      document.getElementById('payment-timer').style.background = 'var(--error-bg)';
      document.getElementById('payment-timer').style.color = 'var(--error)';
      return;
    }
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timerEl = document.getElementById('timer-display');
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }, 1000);
}

async function confirmPayment(orderId) {
  const btn = document.getElementById('btn-confirm-payment');
  const txnId = document.getElementById('upi-txn-id').value.trim();

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></div> Verifying...';

  try {
    const res = await api(`/orders/${orderId}/confirm-payment`, {
      method: 'POST',
      body: { upi_transaction_id: txnId || null }
    });

    // Update status display
    const statusEl = document.getElementById('payment-status');
    statusEl.className = 'payment-status success';
    statusEl.innerHTML = '✅ Payment confirmed successfully!';

    showToast('Payment confirmed! Generating receipt...', 'success');

    // Load receipt after a brief delay
    setTimeout(() => {
      loadReceipt(orderId);
    }, 1500);

  } catch (err) {
    showToast(`Confirmation failed: ${err.message}`, 'error');
    btn.disabled = false;
    btn.innerHTML = '✅ I\'ve Completed the Payment';
  }
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

async function loadReceipt(orderId) {
  const content = document.getElementById('receipt-content');
  navigateTo('receipt');

  try {
    const res = await api(`/orders/${orderId}/receipt`);
    const { receipt_id, order, items, customer, merchant, generated_at } = res.data;

    content.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div class="confirm-checkmark">
            <svg viewBox="0 0 52 52">
              <circle class="circle" cx="26" cy="26" r="25"/>
              <path class="check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
          <h1 style="font-size: 1.5rem; font-weight: 800; color: var(--success);">Payment Successful!</h1>
          <p style="color: var(--text-muted);">Your order has been confirmed</p>
        </div>

        <div class="receipt">
          <div class="receipt-header">
            <div class="store-name">⚡ ${merchant.name}</div>
            <div class="receipt-id">Receipt: ${receipt_id}</div>
          </div>

          <div class="receipt-meta">
            <span class="label">Order ID</span>
            <span class="value" style="font-family: var(--font-mono); font-size: 0.75rem;">${order.id}</span>
            <span class="label">Date</span>
            <span class="value">${new Date(order.paid_at || generated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span class="label">Payment</span>
            <span class="value">UPI — ${merchant.upi_id}</span>
            ${order.upi_transaction_id ? `
              <span class="label">UPI Txn ID</span>
              <span class="value" style="font-family: var(--font-mono);">${order.upi_transaction_id}</span>
            ` : ''}
            ${customer ? `
              <span class="label">Customer</span>
              <span class="value">${customer.name}</span>
              <span class="label">Email</span>
              <span class="value">${customer.email}</span>
            ` : ''}
          </div>

          <div class="receipt-items">
            ${items.map(item => `
              <div class="receipt-item">
                <span class="item-name">${item.product_name} × ${item.quantity}</span>
                <span class="item-price">₹${formatPrice(item.total_price)}</span>
              </div>
            `).join('')}
          </div>

          <div class="receipt-total">
            <span>Total Paid</span>
            <span class="total-amount">₹${formatPrice(order.total_amount)}</span>
          </div>

          <div class="receipt-footer">
            <p>Thank you for your purchase!</p>
            <p style="margin-top: 4px;">Payment ID: ${order.payment_id}</p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 32px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="navigateTo('store')">🏪 Continue Shopping</button>
          <button class="btn btn-secondary" onclick="navigateTo('orders')">📋 View All Orders</button>
          <button class="btn btn-secondary" onclick="window.print()">🖨️ Print Receipt</button>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">😵</div>
        <h3>Failed to load receipt</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const content = document.getElementById('dashboard-content');

  try {
    const res = await api('/dashboard/stats');
    const { orders, customers, products, recent_orders, webhooks } = res.data;

    content.innerHTML = `
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card accent">
          <div class="stat-label">Total Revenue</div>
          <div class="stat-value">₹${formatPrice(orders.total_revenue || 0)}</div>
          <div class="stat-sub">${orders.paid_orders || 0} successful payments</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">Total Orders</div>
          <div class="stat-value">${orders.total_orders || 0}</div>
          <div class="stat-sub">${orders.pending_orders || 0} pending</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">Customers</div>
          <div class="stat-value">${customers || 0}</div>
          <div class="stat-sub">Registered users</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">Avg Order Value</div>
          <div class="stat-value">₹${formatPrice(orders.avg_order_value || 0)}</div>
          <div class="stat-sub">Per paid order</div>
        </div>
      </div>

      <!-- Payment Status Breakdown -->
      <div class="stats-grid" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); margin-bottom: 32px;">
        <div class="stat-card">
          <div class="stat-label" style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--success);">●</span> Paid
          </div>
          <div class="stat-value" style="font-size: 1.5rem;">${orders.paid_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--info);">●</span> Pending
          </div>
          <div class="stat-value" style="font-size: 1.5rem;">${orders.pending_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--error);">●</span> Failed
          </div>
          <div class="stat-value" style="font-size: 1.5rem;">${orders.failed_orders || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label" style="display: flex; align-items: center; gap: 6px;">
            <span style="color: var(--warning);">●</span> Webhooks
          </div>
          <div class="stat-value" style="font-size: 1.5rem;">${webhooks.total_events || 0}</div>
          <div class="stat-sub">${webhooks.duplicates || 0} idempotent duplicates caught</div>
        </div>
      </div>

      <!-- Recent Orders -->
      <div class="orders-table-wrap">
        <div class="table-header">
          <h3>Recent Orders</h3>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('orders')">View All →</button>
        </div>
        ${recent_orders && recent_orders.length > 0 ? `
          <table class="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${recent_orders.map(o => `
                <tr onclick="viewOrderDetail('${o.id}')" style="cursor: pointer;">
                  <td><span class="order-id">${o.id}</span></td>
                  <td>${o.customer_name || 'Guest'}</td>
                  <td style="font-weight: 600;">₹${formatPrice(o.total_amount)}</td>
                  <td><span class="status-badge ${o.status.toLowerCase()}">${o.status}</span></td>
                  <td style="color: var(--text-muted); font-size: 0.8rem;">${formatDate(o.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div class="empty-state">
            <div class="icon">📋</div>
            <h3>No orders yet</h3>
            <p>Orders will appear here after customers make purchases</p>
          </div>
        `}
      </div>

      <!-- Webhook Info -->
      <div class="webhook-tester" style="margin-top: 24px;">
        <h3>🔐 Webhook Security</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 12px;">
          All payment confirmations are processed through HMAC-SHA256 verified webhooks with idempotency checks.
          Duplicate events are automatically detected and skipped.
        </p>
        <div class="code-block">POST /api/webhook/payment
Content-Type: application/json
X-Webhook-Signature: &lt;hmac-sha256-hex&gt;

{
  "event_id": "evt_unique_id",
  "order_id": "ord_xxxxx",
  "payment_id": "pay_xxxxx",
  "upi_transaction_id": "326419876543",
  "status": "PAYMENT_SUCCESS",
  "amount": 2999.00
}</div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">😵</div>
        <h3>Failed to load dashboard</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="loadDashboard()" style="margin-top: 16px">Retry</button>
      </div>
    `;
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function loadOrders() {
  const content = document.getElementById('orders-content');

  try {
    const res = await api('/orders');
    const { orders, counts } = res.data;

    content.innerHTML = `
      <!-- Filter tabs -->
      <div class="tab-nav" style="margin-bottom: 24px;">
        <button class="tab-btn active" onclick="filterOrders(this, '')">All (${counts.total})</button>
        <button class="tab-btn" onclick="filterOrders(this, 'CREATED')">Pending (${counts.created})</button>
        <button class="tab-btn" onclick="filterOrders(this, 'PAID')">Paid (${counts.paid})</button>
        <button class="tab-btn" onclick="filterOrders(this, 'FAILED')">Failed (${counts.failed})</button>
      </div>

      <div class="orders-table-wrap">
        ${orders.length > 0 ? `
          <table class="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Payment ID</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="orders-tbody">
              ${renderOrderRows(orders)}
            </tbody>
          </table>
        ` : `
          <div class="empty-state">
            <div class="icon">📋</div>
            <h3>No orders found</h3>
            <p>Create your first order from the store</p>
            <button class="btn btn-primary" onclick="navigateTo('store')" style="margin-top: 16px">Go to Store</button>
          </div>
        `}
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">😵</div>
        <h3>Failed to load orders</h3>
        <p>${err.message}</p>
        <button class="btn btn-primary" onclick="loadOrders()" style="margin-top: 16px">Retry</button>
      </div>
    `;
  }
}

function renderOrderRows(orders) {
  return orders.map(o => `
    <tr>
      <td><span class="order-id">${o.id}</span></td>
      <td>${o.customer_name || o.customer_email || 'Guest'}</td>
      <td style="font-weight: 600;">₹${formatPrice(o.total_amount)}</td>
      <td><span class="status-badge ${o.status.toLowerCase()}">${o.status}</span></td>
      <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
        ${o.payment_id || '—'}
      </td>
      <td style="color: var(--text-muted); font-size: 0.8rem;">
        ${formatDate(o.created_at)}
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-ghost btn-sm" onclick="viewOrderDetail('${o.id}')" title="View Details">👁️</button>
          ${o.status === 'CREATED' ? `
            <button class="btn btn-ghost btn-sm" onclick="regeneratePaymentLink('${o.id}')" title="Payment Link">🔗</button>
          ` : ''}
          ${o.status === 'PAID' ? `
            <button class="btn btn-ghost btn-sm" onclick="loadReceipt('${o.id}')" title="Receipt">🧾</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

async function filterOrders(btn, status) {
  // Update tab UI
  document.querySelectorAll('#page-orders .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  try {
    const endpoint = status ? `/orders?status=${status}` : '/orders';
    const res = await api(endpoint);
    const tbody = document.getElementById('orders-tbody');
    if (tbody) {
      tbody.innerHTML = renderOrderRows(res.data.orders);
    }
  } catch (err) {
    showToast('Failed to filter orders', 'error');
  }
}

async function viewOrderDetail(orderId) {
  const modal = document.getElementById('order-modal');
  const body = document.getElementById('modal-body');
  const footer = document.getElementById('modal-footer');
  const title = document.getElementById('modal-title');

  title.textContent = `Order ${orderId}`;
  body.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  modal.classList.add('active');

  try {
    const res = await api(`/orders/${orderId}`);
    const { order, items, customer, events } = res.data;

    body.innerHTML = `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <span class="status-badge ${order.status.toLowerCase()}">${order.status}</span>
          <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${order.id}</span>
        </div>

        ${customer ? `
          <div style="background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 16px;">
            <div style="font-weight: 600;">${customer.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${customer.email}${customer.phone ? ` • ${customer.phone}` : ''}</div>
          </div>
        ` : ''}

        <h4 style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Items</h4>
        ${items.map(item => `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
            <span>${item.product_name} × ${item.quantity}</span>
            <span style="font-weight: 600;">₹${formatPrice(item.total_price)}</span>
          </div>
        `).join('')}
        <div style="display: flex; justify-content: space-between; padding: 12px 0; font-weight: 800; font-size: 1.1rem;">
          <span>Total</span>
          <span style="color: var(--success);">₹${formatPrice(order.total_amount)}</span>
        </div>
      </div>

      ${order.payment_id ? `
        <div style="background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 16px;">
          <div style="font-size: 0.8rem; color: var(--text-muted);">Payment ID</div>
          <div style="font-family: var(--font-mono); font-size: 0.85rem;">${order.payment_id}</div>
          ${order.upi_transaction_id ? `
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">UPI Transaction ID</div>
            <div style="font-family: var(--font-mono); font-size: 0.85rem;">${order.upi_transaction_id}</div>
          ` : ''}
          ${order.paid_at ? `
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">Paid At</div>
            <div style="font-size: 0.85rem;">${formatDate(order.paid_at)}</div>
          ` : ''}
        </div>
      ` : ''}

      ${events && events.length > 0 ? `
        <h4 style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">Webhook Events</h4>
        ${events.map(evt => `
          <div style="background: var(--bg-elevated); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 8px; font-size: 0.8rem;">
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--accent-primary);">${evt.event_type}</span>
              <span style="color: var(--text-muted);">${formatDate(evt.created_at)}</span>
            </div>
            <div style="color: var(--text-muted); margin-top: 4px;">
              Verified: ${evt.verified ? '✅' : '❌'} • Processed: ${evt.processed ? '✅' : '❌'}
            </div>
          </div>
        `).join('')}
      ` : ''}
    `;

    footer.innerHTML = `
      ${order.status === 'CREATED' ? `
        <button class="btn btn-success" onclick="closeModal(); confirmPaymentFromModal('${order.id}')">✅ Confirm Payment</button>
      ` : ''}
      ${order.status === 'PAID' ? `
        <button class="btn btn-primary" onclick="closeModal(); loadReceipt('${order.id}')">🧾 View Receipt</button>
      ` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    `;
  } catch (err) {
    body.innerHTML = `<p style="color: var(--error);">Failed to load order: ${err.message}</p>`;
  }
}

async function confirmPaymentFromModal(orderId) {
  try {
    await api(`/orders/${orderId}/confirm-payment`, { method: 'POST', body: {} });
    showToast('Payment confirmed!', 'success');
    loadOrders();
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

async function regeneratePaymentLink(orderId) {
  try {
    const res = await api(`/orders/${orderId}/payment-link`, { method: 'POST' });
    const data = res.data;

    // Show in a simple modal
    const modal = document.getElementById('order-modal');
    const body = document.getElementById('modal-body');
    const title = document.getElementById('modal-title');
    const footer = document.getElementById('modal-footer');

    title.textContent = 'Payment Link';
    body.innerHTML = `
      <div style="text-align: center;">
        <div class="amount-display" style="font-size: 2rem;">${formatPrice(data.amount)}</div>
        <p style="color: var(--text-muted); margin-bottom: 16px;">Scan to pay for ${orderId}</p>
        ${data.qr_code ? `
          <div class="qr-container" style="display: inline-block; background: white; border-radius: var(--radius-lg); padding: 20px;">
            <img src="${data.qr_code}" alt="QR" width="250" height="250">
          </div>
        ` : ''}
        <div class="upi-id-display" style="margin: 16px auto;">
          <span>UPI:</span>
          <strong>${data.merchant_upi_id}</strong>
          <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${data.merchant_upi_id}')">📋</button>
        </div>
      </div>
    `;
    footer.innerHTML = `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`;
    modal.classList.add('active');

  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

function closeModal() {
  document.getElementById('order-modal').classList.remove('active');
}

// ─── Architecture Page ────────────────────────────────────────────────────────

function renderArchitecture() {
  const content = document.getElementById('architecture-content');
  content.innerHTML = `
    <div class="arch-diagram">
      <h3 style="margin-bottom: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
        🏗️ Two-Phase Verification Architecture
      </h3>
      <pre>
┌─────────────┐     1. Create Order      ┌──────────────┐
│             │ ─────────────────────────▶│              │
│  Customer   │                           │  Your Server │
│  (Browser)  │     2. UPI Link + QR      │  (PayFlow)   │
│             │ ◀─────────────────────────│              │
└──────┬──────┘                           └──────┬───────┘
       │                                         │
       │  3. Scan QR / Open UPI Link             │
       │                                         │
       ▼                                         │
┌─────────────┐                                  │
│  UPI App    │     4. Payment via UPI            │
│ (GPay,      │ ──────────────────────────────────┘
│  PhonePe)   │                                  │
└─────────────┘                                  │
                                                 │
                    5. Manual Confirm /           │
                       Webhook Event              │
                    (order_id, payment_id)         │
                                                 ▼
┌─────────────┐     6. Receipt / Ack     ┌──────────────┐
│  Customer   │ ◀────────────────────────│  Your Server │
│  (Browser)  │                          │  (Verify &   │
│             │                          │   Save)      │
└─────────────┘                          └──────────────┘</pre>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
      <div class="card">
        <h3 style="margin-bottom: 16px; font-weight: 700; color: var(--accent-primary);">🔐 Signature Verification</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.7;">
          Every webhook payload is signed using <strong>HMAC-SHA256</strong> with your server's secret key.
          Before processing any payment event, PayFlow computes the expected hash and compares it using
          timing-safe comparison to prevent timing attacks.
        </p>
        <div class="code-block" style="margin-top: 16px;">
// Verify webhook signature
const crypto = require('crypto');
const hmac = crypto.createHmac('sha256', SECRET);
hmac.update(JSON.stringify(payload));
const expected = hmac.digest('hex');

// Timing-safe comparison
crypto.timingSafeEqual(
  Buffer.from(expected, 'hex'),
  Buffer.from(signature, 'hex')
);</div>
      </div>

      <div class="card">
        <h3 style="margin-bottom: 16px; font-weight: 700; color: var(--warning);">🔄 Idempotency</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.7;">
          Gateway webhooks may retry delivery multiple times due to network issues.
          PayFlow tracks every <code>event_id</code> in a webhook log table.
          If an event has already been processed, it returns a success response
          without re-executing downstream tasks.
        </p>
        <div class="code-block" style="margin-top: 16px;">
// Check idempotency
const existing = db.prepare(
  'SELECT * FROM webhook_log WHERE event_id = ?'
).get(event_id);

if (existing?.status === 'PROCESSED') {
  return { success: true,
           message: 'Already processed',
           idempotent: true };
}

// Also check order-level idempotency
if (order.status === 'PAID') {
  return { success: true,
           message: 'Order already paid' };
}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
      <div class="card">
        <h3 style="margin-bottom: 16px; font-weight: 700; color: var(--error);">⚠️ Never Trust the Client</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.7;">
          If a user closes their browser before the redirect, your frontend will never notify your backend.
          <strong>Always treat the server webhook as the source of truth</strong> for payment success.
          PayFlow separates frontend acknowledgment from backend settlement.
        </p>
      </div>

      <div class="card">
        <h3 style="margin-bottom: 16px; font-weight: 700; color: var(--success);">📡 Webhook Endpoint</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.7;">
          The <code>POST /api/webhook/payment</code> endpoint handles all incoming payment events.
          For self-hosted UPI (no gateway), use the manual confirmation flow which internally
          generates a signed webhook payload for consistency.
        </p>
      </div>
    </div>

    <!-- Live Flow Steps -->
    <div class="card" style="margin-top: 24px;">
      <h3 style="margin-bottom: 20px; font-weight: 700;">📋 Payment Flow Steps</h3>
      <div class="flow-steps">
        <div class="flow-step completed">
          <div class="step-num">1</div>
          <div class="step-content">
            <h4>Customer Creates Order</h4>
            <p>POST /api/orders — Validates products, calculates total, creates order record, generates UPI payment link with reference_id (order_id embedded in UPI &lt;tr&gt; parameter).</p>
          </div>
        </div>
        <div class="flow-step completed">
          <div class="step-num">2</div>
          <div class="step-content">
            <h4>Server Returns QR Code + UPI Link</h4>
            <p>QR code is generated using the UPI deep link spec (upi://pay?pa=...&tr=order_id). Customer scans with any UPI app.</p>
          </div>
        </div>
        <div class="flow-step completed">
          <div class="step-num">3</div>
          <div class="step-content">
            <h4>Customer Pays via UPI</h4>
            <p>Payment is processed by the UPI network between customer's bank and merchant's bank. The order_id is carried as the transaction reference.</p>
          </div>
        </div>
        <div class="flow-step completed">
          <div class="step-num">4</div>
          <div class="step-content">
            <h4>Webhook / Manual Confirmation</h4>
            <p>POST /api/webhook/payment — Server receives the payment event, verifies HMAC signature, checks idempotency, and updates order status atomically in a transaction.</p>
          </div>
        </div>
        <div class="flow-step completed">
          <div class="step-num">5</div>
          <div class="step-content">
            <h4>Order Marked PAID + Receipt Generated</h4>
            <p>Stock is decremented, notification is queued, and the customer sees their receipt. All in a single database transaction for consistency.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- API Reference -->
    <div class="card" style="margin-top: 24px;">
      <h3 style="margin-bottom: 16px; font-weight: 700;">📡 API Reference</h3>
      <table class="orders-table" style="width: 100%;">
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/products</td><td>List all products</td></tr>
          <tr><td><span class="status-badge created" style="font-size: 0.65rem;">POST</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/orders</td><td>Create order + UPI payment link</td></tr>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/orders/:id</td><td>Get order details + events</td></tr>
          <tr><td><span class="status-badge created" style="font-size: 0.65rem;">POST</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/webhook/payment</td><td>Webhook — process payment event</td></tr>
          <tr><td><span class="status-badge created" style="font-size: 0.65rem;">POST</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/orders/:id/confirm-payment</td><td>Manual payment confirmation</td></tr>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/orders/:id/receipt</td><td>Generate receipt for paid order</td></tr>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/dashboard/stats</td><td>Dashboard analytics</td></tr>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/customers</td><td>List customers</td></tr>
          <tr><td><span class="status-badge paid" style="font-size: 0.65rem;">GET</span></td><td style="font-family: var(--font-mono); font-size: 0.8rem;">/api/notifications</td><td>View notification log</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard!', 'success');
  });
}

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
    const overlay = document.getElementById('cart-overlay');
    if (overlay.classList.contains('active')) toggleCart();
  }
});

// ─── Initialize ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
});
