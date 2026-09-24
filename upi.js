// ============================================================================
// UPI PAYMENT UTILITIES
// Generates UPI deep links and QR codes without any third-party gateway
// ============================================================================
const QRCode = require('qrcode');
const crypto = require('crypto');

const CONFIG = {
  merchantUpiId: process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE',
  merchantName: process.env.MERCHANT_NAME || 'PayFlow Store',
  webhookSecret: process.env.WEBHOOK_SECRET || 'pf_whsec_a7b3c9d2e1f4g5h6i8j0k2l3m4n5o6p7'
};

/**
 * Generate a UPI deep link URI
 * Format: upi://pay?pa=<VPA>&pn=<Name>&am=<Amount>&cu=<Currency>&tn=<Note>&tr=<RefId>
 */
function generateUpiLink(params) {
  const { amount, orderId, note } = params;

  const upiParams = new URLSearchParams({
    pa: CONFIG.merchantUpiId,
    pn: CONFIG.merchantName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note || `Payment for Order ${orderId}`,
    tr: orderId,           // Transaction Reference (your order_id)
    mc: '5411',            // Merchant Category Code (General)
    mode: '02'             // QR code mode
  });

  return `upi://pay?${upiParams.toString()}`;
}

/**
 * Generate a QR code as a data URL from a UPI link
 */
async function generateQrCode(upiLink) {
  try {
    const dataUrl = await QRCode.toDataURL(upiLink, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });
    return dataUrl;
  } catch (err) {
    console.error('QR generation error:', err);
    throw err;
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook payloads
 */
function generateWebhookSignature(payload) {
  const hmac = crypto.createHmac('sha256', CONFIG.webhookSecret);
  hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * Verify HMAC-SHA256 signature from webhook
 */
function verifyWebhookSignature(payload, signature) {
  const expected = generateWebhookSignature(payload);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

/**
 * Generate a unique payment ID
 */
function generatePaymentId() {
  return `pay_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Generate a unique event ID for idempotency
 */
function generateEventId() {
  return `evt_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  CONFIG,
  generateUpiLink,
  generateQrCode,
  generateWebhookSignature,
  verifyWebhookSignature,
  generatePaymentId,
  generateEventId
};
