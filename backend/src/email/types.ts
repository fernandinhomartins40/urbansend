/**
 * 📧 TIPOS CENTRALIZADOS DO SISTEMA DE EMAIL EXTERNO
 * Versão: 1.0.0 - Sistema Simplificado e Funcional
 */

export interface EmailData {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  templateId?: number;
  variables?: Record<string, any>;
  priority?: number;
  message_id?: string;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: string;
}

export interface EmailContext {
  userId: number;
  tenantId?: number;  // Para futuro B2B
  permissions: string[];
  quotas: EmailQuotas;
  apiKeyId?: number;
}

export interface EmailQuotas {
  dailyLimit: number;
  dailyUsed: number;
  hourlyLimit: number;
  hourlyUsed: number;
  monthlyLimit: number;
  monthlyUsed: number;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  trackingId?: string;
  error?: string;
  latency?: number;
  retryAfter?: number;
}

export interface EmailRecord {
  id?: number;
  userId: number;
  messageId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  status: EmailStatus;
  sentAt: Date;
  errorMessage?: string;
  tenantId?: number;
  domainValidated: boolean;
  fallbackApplied: boolean;
  deliveryLatencyMs?: number;
  smtpResponse?: string;
  originalFrom?: string;
}

export type EmailStatus = 'sent' | 'failed';

export interface ValidationResult {
  valid: boolean;
  email?: EmailData;
  reason?: string;
  warnings?: string[];
}

export interface EmailEvent {
  type: 'sent' | 'failed' | 'queued' | 'delivered';
  userId: number;
  messageId: string;
  timestamp: Date;
  latency?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface EmailMetrics {
  // Performance
  latency_p50: number;
  latency_p95: number;
  latency_p99: number;
  
  // Reliability
  success_rate: number;
  error_rate: number;
  
  // Business
  emails_sent_total: number;
  quota_utilization: number;
  
  // SaaS
  active_users: number;
  top_senders: Array<{userId: number, count: number}>;
}

export interface QueueResult {
  success: boolean;
  jobId?: string;
  processedImmediately?: boolean;
  queuedAt?: Date;
  estimatedProcessTime?: Date;
}

export interface QueueHealth {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface Alert {
  type: 'quota_exceeded' | 'high_failure_rate' | 'high_latency';
  severity: 'info' | 'warning' | 'critical';
  userId: number;
  message: string;
  threshold: number;
  current: number;
  timestamp: Date;
}

// Database interfaces - Updated to match domains table schema
export interface UserDomain {
  id: number;
  user_id: number;
  domain_name: string;  // Updated field name
  is_verified: boolean; // Updated field name
  verified_at?: Date;
  verification_method?: string;
  verification_token?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DailyEmailMetrics {
  id: number;
  userId: number;
  date: string;
  totalSent: number;
  totalFailed: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  quotaUsed: number;
  quotaLimit: number;
}