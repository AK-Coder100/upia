# node-upi-service

Lightweight, production-ready, zero-gateway UPI payment link generator, dynamic QR codes, app intent links (Google Pay, PhonePe, Paytm, BHIM, CRED), and webhook signature verification for Node.js, Express, Next.js, and TypeScript.

---

## 📦 How to install in any application

### Option 1: Local File Dependency (Fastest for your own projects)
In your other project's `package.json`:
```bash
npm install ../path/to/packages/upi-service
# or yarn add file:../path/to/packages/upi-service
```

### Option 2: Git Repository (Private or Public GitHub)
Push this folder to a GitHub repository, then install it anywhere:
```bash
npm install github:your-username/node-upi-service
```

### Option 3: Publish to npm
```bash
cd packages/upi-service
npm login
npm publish --access public
```
Then install in any project:
```bash
npm install node-upi-service
```

---

## 🚀 Quick Start

### CommonJS (`require`)
```javascript
const { UpiService, generateUpiLink, createPaymentSession } = require('node-upi-service');

const upi = new UpiService({
  merchantUpiId: 'merchant@okhdfcbank',
  merchantName: 'My Awesome Store',
  webhookSecret: 'my_secret_key'
});

// Create full payment session
const session = await upi.createPaymentSession({
  amount: 499.00,
  note: 'Order #1024'
});
console.log(session.upiLink);
console.log(session.qrCode); // Base64 PNG
console.log(session.appLinks); // GPay, PhonePe, Paytm, BHIM, Cred
```

### ES Modules / Next.js / TypeScript (`import`)
```typescript
import { UpiService, PaymentSession } from 'node-upi-service';

const upi = new UpiService();
const session: PaymentSession = await upi.createPaymentSession({ amount: 99.00 });
```

---

## 📱 Mobile UPI Intent Links

On mobile devices, open the customer's preferred UPI app with a single click:

```javascript
const appLinks = upi.generateAppIntentLinks({
  amount: 199.00,
  orderId: 'ord_12345'
});

// appLinks.gpay     -> tez://upi/pay?...
// appLinks.phonepe  -> phonepe://pay?...
// appLinks.paytm    -> paytmmp://pay?...
// appLinks.bhim     -> bhim://pay?...
// appLinks.cred     -> cred://pay?...
// appLinks.generic  -> upi://pay?...
```

---

## 🔐 Webhook Signature Security

```javascript
// Generate HMAC-SHA256 signature when dispatching event
const signature = upi.generateWebhookSignature(payload);

// Timing-safe verification on receiver
const isValid = upi.verifyWebhookSignature(req.body, req.headers['x-webhook-signature']);

// Or use built-in Express middleware:
app.post('/api/webhook', upi.webhookMiddleware(), (req, res) => {
  res.json({ success: true });
});
```

---

## 🛠 NPCI UTR & VPA Validation

```javascript
UpiService.validateUtr('326419876543'); // true (12 digits)
UpiService.validateUtr('12345');        // false

UpiService.validateVpa('user@okaxis');   // true
UpiService.validateVpa('invalid');       // false
```

---

## 📄 License
MIT
