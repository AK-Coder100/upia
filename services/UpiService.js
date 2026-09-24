// ============================================================================
// UPI SERVICE — Production-Ready Reusable UPI Payment & Verification Service
// Compatible with Node.js (CommonJS / ES Module interop), Express, Next.js, Fastify
// Zero external dependencies except 'qrcode' for QR rendering.
// ============================================================================

const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Standard NPCI UPI URI Specifications:
 * - pa: Payee VPA / UPI ID (mandatory)
 * - pn: Payee Name (mandatory)
 * - am: Transaction Amount with 2 decimal places (mandatory for fixed amount)
 * - cu: Currency code, typically 'INR' (mandatory)
 * - tn: Transaction Note / Description (optional, max 80 chars)
 * - tr: Transaction Reference ID / Order ID (optional, max 35 chars, alphanumeric)
 * - mc: Merchant Category Code (e.g. 5411 for retail/general)
 * - mode: '02' for static/dynamic QR
 * - url: Callback URL (optional)
 */

class UpiService {
  /**
   * @param {Object} [options]
   * @param {string} [options.merchantUpiId] - UPI ID / VPA (e.g. 'merchant@upi')
   * @param {string} [options.merchantName] - Merchant business name
   * @param {string} [options.merchantCategoryCode] - 4-digit MCC code (default: '5411')
   * @param {string} [options.webhookSecret] - Secret for HMAC signature generation & verification
   * @param {string} [options.currency] - Currency code (default: 'INR')
   */
  constructor(options = {}) {
    this._customMerchantUpiId = options.merchantUpiId || options.vpa || null;
    this._customMerchantName = options.merchantName || options.name || null;
    this._customWebhookSecret = options.webhookSecret || null;

    this.merchantCategoryCode =
      options.merchantCategoryCode ||
      options.mcc ||
      process.env.MERCHANT_MCC ||
      '5411';

    this.currency = options.currency || 'INR';
  }

  get merchantUpiId() {
    return (
      this._customMerchantUpiId ||
      process.env.MERCHANT_UPI_ID ||
      'BHARATPE.8J0S0Z9W9S44900@FBPE'
    );
  }

  set merchantUpiId(val) {
    this._customMerchantUpiId = val;
  }

  get merchantName() {
    return (
      this._customMerchantName ||
      process.env.MERCHANT_NAME ||
      'PayFlow Merchant'
    );
  }

  set merchantName(val) {
    this._customMerchantName = val;
  }

  get webhookSecret() {
    return (
      this._customWebhookSecret ||
      process.env.WEBHOOK_SECRET ||
      'pf_default_secret_key_change_in_production'
    );
  }

  set webhookSecret(val) {
    this._customWebhookSecret = val;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VALIDATORS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Validates if a string is a valid UPI VPA format (e.g. user@okhdfcbank, name@upi)
   * @param {string} vpa
   * @returns {boolean}
   */
  static validateVpa(vpa) {
    if (!vpa || typeof vpa !== 'string') return false;
    const vpaRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    return vpaRegex.test(vpa.trim());
  }

  /**
   * Validates standard Indian Banking UPI UTR / RRN (12-digit numeric reference)
   * @param {string|number} utr
   * @returns {boolean}
   */
  static validateUtr(utr) {
    if (!utr) return false;
    const cleanUtr = String(utr).trim();
    return /^\d{12}$/.test(cleanUtr);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LINK & URI GENERATION
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates a standard NPCI compliant UPI Deep Link URI
   * @param {Object} params
   * @param {number|string} params.amount - Amount to pay (e.g. 499.00)
   * @param {string} params.orderId - Unique order reference ID
   * @param {string} [params.note] - Payment description/note (max 80 chars)
   * @param {string} [params.payeeVpa] - Custom payee VPA (overrides default merchant VPA)
   * @param {string} [params.payeeName] - Custom payee name
   * @param {string} [params.callbackUrl] - Optional callback URL
   * @returns {string} upi://pay?...
   */
  generateUpiLink(params = {}) {
    const amountVal = parseFloat(params.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      throw new Error(`Invalid amount: ${params.amount}. Must be a positive number.`);
    }

    const payeeVpa = params.payeeVpa || this.merchantUpiId;
    if (!payeeVpa) {
      throw new Error('Merchant UPI ID (VPA) is required to generate a UPI link.');
    }

    const payeeName = params.payeeName || this.merchantName;
    const orderId = params.orderId ? String(params.orderId).trim() : this.generateOrderId();
    const note = (params.note || `Payment for ${orderId}`).slice(0, 80);

    const queryParams = new URLSearchParams({
      pa: payeeVpa,
      pn: payeeName,
      am: amountVal.toFixed(2),
      cu: this.currency,
      tn: note,
      tr: orderId,
      mc: this.merchantCategoryCode,
      mode: '02'
    });

    if (params.callbackUrl) {
      queryParams.set('url', params.callbackUrl);
    }

    return `upi://pay?${queryParams.toString()}`;
  }

  /**
   * Generates app-specific intent links for instant checkout on mobile devices.
   * Useful for showing dedicated "Pay with Google Pay", "Pay with PhonePe", etc. buttons.
   * @param {Object} params - Same parameters as generateUpiLink
   * @returns {Object} { generic, gpay, phonepe, paytm, bhim, cred }
   */
  generateAppIntentLinks(params = {}) {
    const rawLink = this.generateUpiLink(params);
    const queryString = rawLink.replace('upi://pay?', '');

    return {
      generic: rawLink,
      gpay: `tez://upi/pay?${queryString}`,
      phonepe: `phonepe://pay?${queryString}`,
      paytm: `paytmmp://pay?${queryString}`,
      bhim: `bhim://pay?${queryString}`,
      cred: `cred://pay?${queryString}`
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // QR CODE GENERATION
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates a Base64 PNG Data URL for embedding directly in <img> tags
   * @param {string} upiLink - The upi:// URI
   * @param {Object} [options] - Custom QRCode options
   * @returns {Promise<string>} data:image/png;base64,...
   */
  async generateQrCode(upiLink, options = {}) {
    if (!upiLink || typeof upiLink !== 'string') {
      throw new Error('Valid UPI link is required to generate a QR code.');
    }

    const defaultOptions = {
      width: options.width || 400,
      margin: options.margin !== undefined ? options.margin : 2,
      color: {
        dark: options.darkColor || '#1a1a2e',
        light: options.lightColor || '#ffffff'
      },
      errorCorrectionLevel: options.errorCorrectionLevel || 'H'
    };

    return QRCode.toDataURL(upiLink, defaultOptions);
  }

  /**
   * Generates an SVG string representation of the QR code (crisp vector, no rasterization)
   * @param {string} upiLink
   * @param {Object} [options]
   * @returns {Promise<string>} <svg ...>...</svg>
   */
  async generateQrSvg(upiLink, options = {}) {
    if (!upiLink || typeof upiLink !== 'string') {
      throw new Error('Valid UPI link is required to generate a QR code SVG.');
    }

    return QRCode.toString(upiLink, {
      type: 'svg',
      width: options.width || 400,
      margin: options.margin !== undefined ? options.margin : 2,
      color: {
        dark: options.darkColor || '#1a1a2e',
        light: options.lightColor || '#ffffff'
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ALL-IN-ONE PAYMENT SESSION CREATION
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Creates a complete payment session object containing the UPI link,
   * Base64 QR code, app-specific deep links, and metadata.
   * @param {Object} params
   * @param {number|string} params.amount - Order amount
   * @param {string} [params.orderId] - Optional order ID (auto-generated if omitted)
   * @param {string} [params.note] - Optional transaction note
   * @param {number} [params.expiresInMinutes=15] - Session validity in minutes
   * @returns {Promise<Object>} Complete session data
   */
  async createPaymentSession(params = {}) {
    const orderId = params.orderId || this.generateOrderId();
    const amount = parseFloat(params.amount);
    const upiLink = this.generateUpiLink({ ...params, orderId });
    const qrCode = await this.generateQrCode(upiLink, params.qrOptions);
    const appLinks = this.generateAppIntentLinks({ ...params, orderId });

    const expiresInMinutes = params.expiresInMinutes || 15;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    return {
      orderId,
      amount,
      currency: this.currency,
      merchantUpiId: params.payeeVpa || this.merchantUpiId,
      merchantName: params.payeeName || this.merchantName,
      upiLink,
      qrCode,
      appLinks,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // WEBHOOK SECURITY & HMAC SIGNING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates HMAC-SHA256 signature for webhook / callback verification
   * @param {string|Object} payload
   * @param {string} [secret] - Optional secret override
   * @returns {string} hex signature
   */
  generateWebhookSignature(payload, secret) {
    const signingSecret = secret || this.webhookSecret;
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', signingSecret).update(raw).digest('hex');
  }

  /**
   * Verifies an incoming webhook signature using timing-safe comparison
   * @param {string|Object} payload - The received body
   * @param {string} signature - The received signature header
   * @param {string} [secret] - Optional secret override
   * @returns {boolean}
   */
  verifyWebhookSignature(payload, signature, secret) {
    if (!signature || typeof signature !== 'string') return false;

    try {
      const expected = this.generateWebhookSignature(payload, secret);
      const expectedBuffer = Buffer.from(expected, 'hex');
      const receivedBuffer = Buffer.from(signature, 'hex');

      if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UNIQUE IDENTIFIER GENERATORS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Generates a unique Payment ID (e.g., pay_9f1a2b3c4d5e)
   * @param {string} [prefix='pay']
   * @returns {string}
   */
  generatePaymentId(prefix = 'pay') {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Generates a unique Order ID (e.g., ord_7a8b9c)
   * @param {string} [prefix='ord']
   * @returns {string}
   */
  generateOrderId(prefix = 'ord') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Generates an Event ID for webhook idempotency
   * @param {string} [prefix='evt']
   * @returns {string}
   */
  generateEventId(prefix = 'evt') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EXPRESS WEBHOOK MIDDLEWARE HELPER
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Express middleware to verify webhook authenticity automatically
   * @param {Object} [options]
   * @param {string} [options.headerName='x-webhook-signature']
   * @returns {Function} Express middleware (req, res, next)
   */
  webhookMiddleware(options = {}) {
    const headerName = options.headerName || 'x-webhook-signature';

    return (req, res, next) => {
      const signature = req.headers[headerName.toLowerCase()];
      if (!signature) {
        return res.status(401).json({
          success: false,
          error: `Missing signature header: ${headerName}`
        });
      }

      const isValid = this.verifyWebhookSignature(req.body, signature);
      if (!isValid) {
        return res.status(403).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }

      next();
    };
  }
}

// Default singleton instance using environment variables
const defaultInstance = new UpiService();

module.exports = {
  UpiService,
  defaultInstance
};
