import { Request, Response, NextFunction } from 'express';

export interface UpiServiceOptions {
  merchantUpiId?: string;
  vpa?: string;
  merchantName?: string;
  name?: string;
  merchantCategoryCode?: string;
  mcc?: string;
  webhookSecret?: string;
  currency?: string;
}

export interface UpiLinkParams {
  amount: number | string;
  orderId?: string;
  note?: string;
  payeeVpa?: string;
  payeeName?: string;
  callbackUrl?: string;
}

export interface AppIntentLinks {
  generic: string;
  gpay: string;
  phonepe: string;
  paytm: string;
  bhim: string;
  cred: string;
}

export interface QrOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface PaymentSessionParams extends UpiLinkParams {
  expiresInMinutes?: number;
  qrOptions?: QrOptions;
}

export interface PaymentSession {
  orderId: string;
  amount: number;
  currency: string;
  merchantUpiId: string;
  merchantName: string;
  upiLink: string;
  qrCode: string;
  appLinks: AppIntentLinks;
  status: 'PENDING' | 'PAID' | 'FAILED';
  createdAt: string;
  expiresAt: string;
}

export class UpiService {
  constructor(options?: UpiServiceOptions);

  merchantUpiId: string;
  merchantName: string;
  merchantCategoryCode: string;
  webhookSecret: string;
  currency: string;

  static validateVpa(vpa: string): boolean;
  static validateUtr(utr: string | number): boolean;

  generateUpiLink(params: UpiLinkParams): string;
  generateAppIntentLinks(params: UpiLinkParams): AppIntentLinks;
  generateQrCode(upiLink: string, options?: QrOptions): Promise<string>;
  generateQrSvg(upiLink: string, options?: QrOptions): Promise<string>;
  createPaymentSession(params: PaymentSessionParams): Promise<PaymentSession>;

  generateWebhookSignature(payload: string | object, secret?: string): string;
  verifyWebhookSignature(payload: string | object, signature: string, secret?: string): boolean;

  generatePaymentId(prefix?: string): string;
  generateOrderId(prefix?: string): string;
  generateEventId(prefix?: string): string;

  webhookMiddleware(options?: { headerName?: string }): (req: Request, res: Response, next: NextFunction) => void;
}

export const defaultInstance: UpiService;
export function generateUpiLink(params: UpiLinkParams): string;
export function generateAppIntentLinks(params: UpiLinkParams): AppIntentLinks;
export function generateQrCode(upiLink: string, options?: QrOptions): Promise<string>;
export function generateQrSvg(upiLink: string, options?: QrOptions): Promise<string>;
export function createPaymentSession(params: PaymentSessionParams): Promise<PaymentSession>;
export function generateWebhookSignature(payload: string | object, secret?: string): string;
export function verifyWebhookSignature(payload: string | object, signature: string, secret?: string): boolean;
export function generatePaymentId(prefix?: string): string;
export function generateOrderId(prefix?: string): string;
export function generateEventId(prefix?: string): string;
export function validateUtr(utr: string | number): boolean;
export function validateVpa(vpa: string): boolean;
