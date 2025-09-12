/**
 * Tipos para resultados de queries do banco de dados
 * Substitui o uso de 'as any' em queries Knex
 */

// ===============================================
// TIPOS BÁSICOS KNEX
// ===============================================

export interface KnexCountResult {
  count: string | number;
}

export interface KnexAggregateResult {
  total: string | number;
  successful: string | number;
}

// ===============================================
// ESTATÍSTICAS DE EMAIL
// ===============================================

export interface EmailStats {
  total: string | number;
  delivered: string | number;
  failed: string | number;
  pending: string | number;
  sent: string | number;
  bounced: string | number;
  opened: string | number;
  clicked: string | number;
  complained: string | number;
}

export interface EmailAnalytics {
  count: string | number;
  total_sent: string | number;
  total_delivered: string | number;
  total_bounced: string | number;
  total_complained: string | number;
  total_opened: string | number;
  total_clicked: string | number;
}

export interface UserEmailStats {
  total_emails: string | number;
  sent_emails: string | number;
  failed_emails: string | number;
  modified_emails: string | number;
  daily_count: string | number;
  hourly_count: string | number;
}

export interface DomainEmailStats extends EmailStats {
  domain: string;
  total_emails: string | number;
}

// ===============================================
// ESTATÍSTICAS DE MIGRAÇÃO
// ===============================================

export interface MigrationStats {
  successful: string | number;
  total: string | number;
}

export interface LegacyStats extends MigrationStats {
  route_version: string;
  success: boolean;
}

// ===============================================
// ESTATÍSTICAS DE DKIM
// ===============================================

export interface DKIMStats {
  totalKeys: string | number;
  activeKeys: string | number;
  domainsWithDKIM: string | number;
}

// ===============================================
// ESTATÍSTICAS GERAIS
// ===============================================

export interface GlobalStats {
  avg_bounce_rate: string | number;
  avg_complaint_rate: string | number;
  avg_delivery_rate: string | number;
  total_emails_sent: string | number;
}

export interface ValidationStats {
  total_validations: string | number;
  fallback_count: string | number;
  validation_failures: string | number;
}

// ===============================================
// QUERIES DE ANALYTICS TEMPORAIS
// ===============================================

export interface HourlyStats {
  hour: string;
  emails: string | number;
  delivered: string | number;
  bounced: string | number;
}

export interface DailyStats {
  day_of_week: string | number;
  emails: string | number;
  avg_delivery_rate: string | number;
}

export interface TrendData {
  date: string;
  emails: string | number;
  delivery_rate: string | number;
  bounce_rate: string | number;
}

// ===============================================
// TIPOS DE WEBHOOK
// ===============================================

export interface WebhookStats {
  total: string | number;
  successful: string | number;
  failed: string | number;
  pending: string | number;
}

// ===============================================
// TIPOS DE SMTP CONNECTION
// ===============================================

export interface SMTPConnectionStats {
  active_connections: string | number;
  total_connections: string | number;
  failed_connections: string | number;
  server_type: string;
}

export interface SMTPConnectionMetric {
  date: string;
  connections: string | number;
  errors: string | number;
  server_type: string;
}

// ===============================================
// TIPOS PARA QUEUE
// ===============================================

export interface QueueJobMetrics {
  total_jobs: string | number;
  completed_jobs: string | number;
  failed_jobs: string | number;
  waiting_jobs: string | number;
}

// ===============================================
// HELPERS DE PARSING
// ===============================================

/**
 * Converte valores de database (string | number) para number
 * @param value Valor do banco de dados
 * @returns Número parseado ou 0 se inválido
 */
export function parseCount(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  return parseInt(String(value)) || 0;
}

/**
 * Converte valores de database (string | number) para number com decimais
 * @param value Valor do banco de dados
 * @returns Número parseado ou 0 se inválido
 */
export function parseFloat(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  return Number(value) || 0;
}

/**
 * Calcula taxa de sucesso
 * @param stats Objeto com successful e total
 * @returns Taxa de sucesso em porcentagem
 */
export function calculateSuccessRate(stats: MigrationStats): number {
  const successful = parseCount(stats.successful);
  const total = parseCount(stats.total);
  return total > 0 ? (successful / total) * 100 : 0;
}

/**
 * Calcula taxa de entrega
 * @param stats Objeto com delivered e total
 * @returns Taxa de entrega em porcentagem
 */
export function calculateDeliveryRate(stats: EmailStats): number {
  const delivered = parseCount(stats.delivered);
  const total = parseCount(stats.total);
  return total > 0 ? (delivered / total) * 100 : 0;
}

/**
 * Calcula taxa de abertura
 * @param stats Objeto com opened e total
 * @returns Taxa de abertura em porcentagem
 */
export function calculateOpenRate(stats: EmailStats): number {
  const opened = parseCount(stats.opened);
  const total = parseCount(stats.total);
  return total > 0 ? (opened / total) * 100 : 0;
}

/**
 * Calcula taxa de clique
 * @param stats Objeto com clicked e total
 * @returns Taxa de clique em porcentagem
 */
export function calculateClickRate(stats: EmailStats): number {
  const clicked = parseCount(stats.clicked);
  const total = parseCount(stats.total);
  return total > 0 ? (clicked / total) * 100 : 0;
}