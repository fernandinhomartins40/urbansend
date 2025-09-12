/**
 * @ultrazend/smtp-server - Types
 * Tipos para servidor SMTP completo
 */

import { SMTPServerSession } from 'smtp-server';

export interface SMTPServerConfig {
  mxPort?: number;
  submissionPort?: number;
  hostname?: string;
  maxConnections?: number;
  maxMessageSize?: number;
  authRequired?: boolean;
  tlsEnabled?: boolean;
  certPath?: string;
  keyPath?: string;
  databasePath?: string;
  logLevel?: 'error' | 'warn' | 'info' | 'debug';
}

export interface SMTPSession extends SMTPServerSession {
  user?: any;
  authenticated?: boolean;
  rateLimitChecked?: boolean;
  securityValidated?: boolean;
}

export interface EmailData {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  messageId?: string;
  dkimSignature?: string;
}

export interface MXRecord {
  exchange: string;
  priority: number;
}

export interface DKIMConfig {
  domain: string;
  selector: string;
  privateKey: string;
  publicKey?: string;
  algorithm: 'rsa-sha256' | 'rsa-sha1';
  canonicalization: 'relaxed/relaxed' | 'simple/simple' | 'relaxed/simple' | 'simple/relaxed';
  keySize: 1024 | 2048 | 4096;
}

export interface ProcessingResult {
  success: boolean;
  messageId?: string;
  action?: string;
  reason?: string;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  mxServer?: string;
  error?: string;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Domain {
  id: number;
  user_id: number;
  domain_name: string;
  is_verified: boolean;
  verification_token?: string;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
}

export interface SecurityResult {
  allowed: boolean;
  reason?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ServerStats {
  connections: any[];
  authentication: any[];
  delivery: any[];
  uptime: number;
  timestamp: string;
}