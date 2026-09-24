const crypto = require('crypto');
const QRCode = require('qrcode');

class UpiService {
  /**
   * @param {Object} [options]
   * @param {string} [options.merchantUpiId] - UPI ID / VPA (e.g. 'merchant@upi')
   * @param {string} [options.merchantName] - Merchant business name
   * @param {string} [options.merchantCategoryCode] - 4-digit MCC code (default: '5411')
   * @param {string} [options.webhookSecret] - Secret for HMAC signature verification
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

  static validateVpa(vpa) {
    if (!vpa || typeof vpa !== 'string') return false;
    const vpaRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    return vpaRegex.test(vpa.trim());
  }

  static validateUtr(utr) {
    if (!utr) return false;
    const cleanUtr = String(utr).trim();
    return /^\d{12}$/.test(cleanUtr);
  }

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

  generateWebhookSignature(payload, secret) {
    const signingSecret = secret || this.webhookSecret;
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', signingSecret).update(raw).digest('hex');
  }

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

  generatePaymentId(prefix = 'pay') {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  generateOrderId(prefix = 'ord') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

  generateEventId(prefix = 'evt') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
  }

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

const defaultInstance = new UpiService();

module.exports = {
  UpiService,
  defaultInstance,
  generateUpiLink: (params) => defaultInstance.generateUpiLink(params),
  generateAppIntentLinks: (params) => defaultInstance.generateAppIntentLinks(params),
  generateQrCode: (link, opts) => defaultInstance.generateQrCode(link, opts),
  generateQrSvg: (link, opts) => defaultInstance.generateQrSvg(link, opts),
  createPaymentSession: (params) => defaultInstance.createPaymentSession(params),
  generateWebhookSignature: (p, s) => defaultInstance.generateWebhookSignature(p, s),
  verifyWebhookSignature: (p, sig, s) => defaultInstance.verifyWebhookSignature(p, sig, s),
  generatePaymentId: (p) => defaultInstance.generatePaymentId(p),
  generateOrderId: (p) => defaultInstance.generateOrderId(p),
  generateEventId: (p) => defaultInstance.generateEventId(p),
  validateUtr: UpiService.validateUtr,
  validateVpa: UpiService.validateVpa
};
