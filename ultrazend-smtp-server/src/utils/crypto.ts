/**
 * @ultrazend/smtp-server - Crypto Utils
 * Utilitários criptográficos
 */

import crypto from 'crypto';

export function generateTrackingId(): string {
  return `smtp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateMessageId(hostname: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@${hostname}>`;
}

export function sanitizeEmailHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Sanitização básica - remove scripts e tags perigosas
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .trim();
}