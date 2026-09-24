// ============================================================================
// UPI PAYMENT UTILITIES & SERVICE FACADE
// Re-exports UpiService with 100% backward compatibility for existing routes
// ============================================================================

const { UpiService, defaultInstance } = require('./services/UpiService');

const CONFIG = {
  get merchantUpiId() {
    return defaultInstance.merchantUpiId;
  },
  get merchantName() {
    return defaultInstance.merchantName;
  },
  get webhookSecret() {
    return defaultInstance.webhookSecret;
  }
};

// Backward-compatible standalone function wrappers
function generateUpiLink(params) {
  return defaultInstance.generateUpiLink(params);
}

function generateQrCode(upiLink, options) {
  return defaultInstance.generateQrCode(upiLink, options);
}

function generateQrSvg(upiLink, options) {
  return defaultInstance.generateQrSvg(upiLink, options);
}

function generateAppIntentLinks(params) {
  return defaultInstance.generateAppIntentLinks(params);
}

function createPaymentSession(params) {
  return defaultInstance.createPaymentSession(params);
}

function generateWebhookSignature(payload, secret) {
  return defaultInstance.generateWebhookSignature(payload, secret);
}

function verifyWebhookSignature(payload, signature, secret) {
  return defaultInstance.verifyWebhookSignature(payload, signature, secret);
}

function generatePaymentId(prefix) {
  return defaultInstance.generatePaymentId(prefix);
}

function generateEventId(prefix) {
  return defaultInstance.generateEventId(prefix);
}

function validateUtr(utr) {
  return UpiService.validateUtr(utr);
}

function validateVpa(vpa) {
  return UpiService.validateVpa(vpa);
}

module.exports = {
  UpiService,
  defaultInstance,
  CONFIG,
  generateUpiLink,
  generateQrCode,
  generateQrSvg,
  generateAppIntentLinks,
  createPaymentSession,
  generateWebhookSignature,
  verifyWebhookSignature,
  generatePaymentId,
  generateEventId,
  validateUtr,
  validateVpa
};
