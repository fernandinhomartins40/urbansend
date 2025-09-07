export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  template_id?: number;
  variables?: Record<string, any>;
  tracking?: boolean;
  userId: number;
  apiKeyId?: number;
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredTo?: string[];
  rejectedRecipients?: string[];
}

export interface SystemNotification {
  type: 'welcome' | 'password_reset' | 'account_update' | 'system_alert';
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
}

export interface EmailStats {
  totalEmails: number;
  sentEmails: number;
  failedEmails: number;
  modifiedEmails: number;
  deliveryRate: number;
  modificationRate: number;
}

/**
 * Interface comum para todos os serviços de email
 */
export interface IEmailService {
  /**
   * Envia um email usando as configurações específicas do serviço
   */
  sendEmail?(emailData: SendEmailOptions): Promise<EmailResult>;
  
  /**
   * Envia email de verificação de conta (específico para InternalEmailService)
   */
  sendVerificationEmail?(email: string, name: string, token: string): Promise<void>;
  
  /**
   * Envia email de reset de senha (específico para InternalEmailService)
   */
  sendPasswordResetEmail?(email: string, name: string, resetUrl: string): Promise<void>;
  
  /**
   * Envia notificações do sistema (específico para InternalEmailService)
   */
  sendSystemNotification?(email: string, notification: SystemNotification): Promise<void>;
  
  /**
   * Testa a conexão do serviço
   */
  testConnection?(): Promise<boolean>;

  /**
   * Obtém estatísticas de email (específico para ExternalEmailService)
   */
  getEmailStats?(userId: number, days?: number): Promise<EmailStats>;
}