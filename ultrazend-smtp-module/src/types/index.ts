/**
 * @ultrazend/smtp-internal - TypeScript Types
 * Tipos para módulo SMTP interno
 */

export interface SMTPConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  password?: string;
  dkimPrivateKey?: string;
  dkimSelector?: string;
  dkimDomain?: string;
}

export interface DatabaseConfig {
  connection?: string | object;
  useNullAsDefault?: boolean;
  migrations?: {
    directory?: string;
  };
  pool?: {
    min?: number;
    max?: number;
  };
}

export interface TemplateConfig {
  verification?: string;
  passwordReset?: string;
  notification?: string;
}

export interface ModuleConfig {
  smtp?: SMTPConfig;
  database?: DatabaseConfig | string; // string for sqlite file path
  templates?: TemplateConfig;
  defaultFrom?: string;
  appName?: string;
  appUrl?: string;
  logger?: {
    level?: string;
    enabled?: boolean;
  };
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SystemNotification {
  type: 'welcome' | 'password_reset' | 'account_update' | 'system_alert';
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export interface EmailTemplateData {
  name: string;
  appName: string;
  appUrl: string;
  actionUrl?: string;
  actionText?: string;
  message?: string;
  title?: string;
}

export interface LoggerInterface {
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  debug(message: string, meta?: object): void;
}