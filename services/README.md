# Standalone Reusable UPI Service (`UpiService`)

A zero-external-gateway, direct UPI payment and verification service for Node.js. Generates dynamic UPI deep links, custom app intent links (Google Pay, PhonePe, Paytm, BHIM, Cred), Base64 / SVG QR codes, and provides cryptographic webhook signature verification and NPCI UTR validation.

---

## 🚀 How to Use in Any Other Project

### Step 1: Copy the Service File
Copy [`UpiService.js`](file:///D:/kkkkkkkkkk/services/UpiService.js) into your target project:
```
your-project/
├── services/
│   └── UpiService.js
```

### Step 2: Install the Only Dependency
The service only requires `qrcode` for QR code rendering (all cryptographic and URL utilities use Node's built-in `crypto` and `url` modules):
```bash
npm install qrcode
```

### Step 3: Configure Environment Variables (Optional)
In your `.env` file (or pass directly in the constructor):
```env
MERCHANT_UPI_ID=yourname@okhdfcbank
MERCHANT_NAME="Your Business Name"
MERCHANT_MCC=5411
WEBHOOK_SECRET=your_super_secret_webhook_key
```

---

## 💡 Usage Examples

### 1. Basic Quick Start
```javascript
const { UpiService } = require('./services/UpiService');

// Instantiate with custom settings (or leave empty to read from process.env)
const upi = new UpiService({
  merchantUpiId: 'merchant@upi',
  merchantName: 'My Store',
  webhookSecret: 'my_secret_key'
});

// 1. Generate a standard UPI deep link
const upiLink = upi.generateUpiLink({
  amount: 499.00,
  orderId: 'ORD_98231',
  note: 'Payment for Order #98231'
});
console.log(upiLink);
// Output: upi://pay?pa=merchant@upi&pn=My+Store&am=499.00&cu=INR&tn=Payment+for+Order+%2398231&tr=ORD_98231&mc=5411&mode=02

// 2. Generate Base64 QR code image for HTML <img src="...">
const qrDataUrl = await upi.generateQrCode(upiLink);

// 3. Generate Crisp Vector SVG QR code
const qrSvg = await upi.generateQrSvg(upiLink);
```

---

### 2. All-in-One Payment Session (Best for Checkouts)
Creates the order ID, deep link, base64 QR, app-specific deep links, and expiration in a single call:
```javascript
const session = await upi.createPaymentSession({
  amount: 1499.00,
  note: 'Annual Pro Subscription',
  expiresInMinutes: 15
});

console.log(session);
/*
{
  orderId: 'ord_f0f2970688f81c71',
  amount: 1499,
  currency: 'INR',
  merchantUpiId: 'merchant@upi',
  merchantName: 'My Store',
  upiLink: 'upi://pay?...',
  qrCode: 'data:image/png;base64,...',
  appLinks: {
    generic: 'upi://pay?...',
    gpay: 'tez://upi/pay?...',
    phonepe: 'phonepe://pay?...',
    paytm: 'paytmmp://pay?...',
    bhim: 'bhim://pay?...',
    cred: 'cred://pay?...'
  },
  status: 'PENDING',
  createdAt: '2026-09-24T14:10:46.982Z',
  expiresAt: '2026-09-24T14:25:46.982Z'
}
*/
```

---

### 3. Mobile "Pay with App" Intent Buttons
On mobile browsers, open installed payment apps directly:
```javascript
const appLinks = upi.generateAppIntentLinks({
  amount: 299.00,
  orderId: 'ord_123'
});

// Use in HTML buttons:
// <a href="${appLinks.gpay}">Pay with Google Pay</a>
// <a href="${appLinks.phonepe}">Pay with PhonePe</a>
// <a href="${appLinks.paytm}">Pay with Paytm</a>
```

---

### 4. Express.js Integration (Complete Route Example)
```javascript
const express = require('express');
const { UpiService } = require('./services/UpiService');

const app = express();
app.use(express.json());

const upi = new UpiService();

// Checkout Endpoint
app.post('/api/checkout', async (req, res) => {
  try {
    const { amount, items } = req.body;
    const session = await upi.createPaymentSession({ amount });
    
    // Save session.orderId to your database here...
    
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer UTR submission & validation
app.post('/api/verify-payment', (req, res) => {
  const { orderId, utr } = req.body;
  
  // Validate 12-digit Indian Bank UTR / RRN
  if (!UpiService.validateUtr(utr)) {
    return res.status(400).json({ success: false, error: 'Invalid 12-digit UTR number' });
  }
  
  // Update order status in your DB...
  res.json({ success: true, message: 'UTR submitted for verification' });
});

// Secure Webhook Endpoint (using timing-safe HMAC verification)
app.post('/api/webhook', upi.webhookMiddleware(), (req, res) => {
  const { event, order_id, amount, status } = req.body;
  console.log(`Verified webhook event ${event} for order ${order_id}`);
  
  res.json({ received: true });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

### 5. Next.js App Router API Route (`app/api/pay/route.js`)
```javascript
import { NextResponse } from 'next/server';
import { UpiService } from '@/services/UpiService';

const upi = new UpiService({
  merchantUpiId: process.env.MERCHANT_UPI_ID,
  merchantName: process.env.MERCHANT_NAME
});

export async function POST(request) {
  const body = await request.json();
  const session = await upi.createPaymentSession({
    amount: body.amount,
    note: body.note
  });
  return NextResponse.json({ success: true, session });
}
```

---

## 🛠 API Reference Summary

| Method | Parameters | Return Value | Description |
|---|---|---|---|
| `generateUpiLink(params)` | `{ amount, orderId, note, payeeVpa, payeeName, callbackUrl }` | `string` (`upi://...`) | Generates standard NPCI UPI URI |
| `generateAppIntentLinks(params)` | `{ amount, orderId, note }` | `Object` (`gpay`, `phonepe`, etc.) | App-specific deep links for mobile buttons |
| `generateQrCode(upiLink, options)` | `upiLink, options` | `Promise<string>` | Base64 PNG data URL (`data:image/png;base64,...`) |
| `generateQrSvg(upiLink, options)` | `upiLink, options` | `Promise<string>` | Crisp vector SVG string |
| `createPaymentSession(params)` | `{ amount, orderId, note, expiresInMinutes }` | `Promise<Object>` | Complete session (Order ID, links, QR, expiry) |
| `generateWebhookSignature(payload, secret)` | `payload, [secret]` | `string` (hex) | HMAC-SHA256 signature |
| `verifyWebhookSignature(payload, sig, secret)`| `payload, sig, [secret]` | `boolean` | Timing-safe comparison |
| `webhookMiddleware(options)` | `[options]` | Express Middleware | Protects webhook routes automatically |
| `UpiService.validateUtr(utr)` | `string\|number` | `boolean` | Checks if UTR is valid 12 digits |
| `UpiService.validateVpa(vpa)` | `string` | `boolean` | Checks if UPI ID format is valid |
