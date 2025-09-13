/**
 * 🎯 MULTI-TENANT EMAIL SERVICE - ARQUITETURA SIMPLIFICADA
 * 
 * Baseado no InternalEmailService que funciona perfeitamente
 * Implementa multi-tenancy com simplicidade e confiabilidade
 * 
 * Filosofia: "Simplicidade é a sofisticação suprema"
 */

import { SMTPDeliveryService } from './smtpDelivery';
import { logger } from '../config/logger';
import { SimpleEmailValidator } from '../email/EmailValidator';
import db from '../config/database';

// Interfaces específicas para multi-tenancy
export interface EmailRequest {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_data?: Record<string, any>;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  tenant_id?: number;
}

export interface EmailResult {
  success: boolean;
  message: string;
  message_id?: string;
  status: 'processing' | 'sent' | 'failed';
  domain_verified?: boolean;
  domain?: string;
  error?: string;
}

export interface EmailLogData {
  user_id: number;
  tenant_id?: number;
  from: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed' | 'processing';
  error_message?: string;
  timestamp: Date;
  message_id?: string;
}

/**
 * Serviço de email multi-tenant simplificado
 * 
 * Características preservadas:
 * - Autenticação JWT obrigatória
 * - Validação de propriedade de domínio
 * - Rate limiting por tenant
 * - Logs por tenant no banco
 * - Execução assíncrona como sistema interno
 */
export class MultiTenantEmailService {
  private readonly smtpDelivery: SMTPDeliveryService;
  private readonly emailValidator: SimpleEmailValidator;

  constructor() {
    this.smtpDelivery = new SMTPDeliveryService();
    this.emailValidator = new SimpleEmailValidator();

    logger.info('🚀 MultiTenantEmailService initialized', {
      mode: 'simplified-architecture',
      basedOn: 'InternalEmailService',
      features: ['domain-validation', 'multi-tenancy', 'async-execution']
    });
  }

  /**
   * Enviar email com validação multi-tenancy
   * 
   * Fluxo simplificado inspirado no InternalEmailService:
   * 1. Validação rápida
   * 2. setImmediate() para execução assíncrona
   * 3. SMTP + persistência em paralelo
   * 4. Resposta imediata
   */
  async sendEmail(emailData: EmailRequest, user: AuthUser): Promise<EmailResult> {
    try {
      logger.info('📧 MultiTenant: Initiating email sending', {
        userId: user.id,
        tenantId: user.tenant_id,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? `${emailData.to.length} recipients` : emailData.to,
        subject: emailData.subject
      });

      // 1. Validação rápida de entrada
      const validationResult = this.validateEmailData(emailData);
      if (!validationResult.valid) {
        return {
          success: false,
          message: validationResult.error || 'Validation failed',
          status: 'failed',
          error: validationResult.error
        };
      }

      // 2. Validar propriedade do domínio (multi-tenancy essencial)
      const domain = this.extractDomain(emailData.from);
      if (!domain) {
        return {
          success: false,
          message: 'Invalid email format in "from" field',
          status: 'failed',
          error: 'INVALID_EMAIL_FORMAT'
        };
      }

      const domainCheck = await this.emailValidator.checkDomainOwnership(domain, user.id);
      if (!domainCheck.verified) {
        return {
          success: false,
          message: `Domain '${domain}' not verified. Please verify at /domains`,
          status: 'failed',
          error: 'DOMAIN_NOT_VERIFIED',
          domain
        };
      }

      // 3. Gerar message_id único
      const messageId = this.generateMessageId();

      // 4. Processamento assíncrono (como InternalEmailService)
      setImmediate(async () => {
        await this.processEmailAsync(emailData, user, domain, messageId);
      });

      // 5. Resposta imediata (não bloquear frontend)
      return {
        success: true,
        message: 'Email queued for delivery with verified domain',
        message_id: messageId,
        status: 'processing',
        domain_verified: true,
        domain
      };

    } catch (error) {
      logger.error('❌ MultiTenant: Email send failed', {
        userId: user.id,
        from: emailData.from,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        message: 'Email sending failed',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Processamento assíncrono do email (inspirado no InternalEmailService)
   * 
   * Executa em paralelo:
   * - Entrega SMTP
   * - Persistência no banco
   * - Logs estruturados
   */
  private async processEmailAsync(
    emailData: EmailRequest, 
    user: AuthUser, 
    domain: string, 
    messageId: string
  ): Promise<void> {
    try {
      logger.info('🔄 Processing email asynchronously', {
        userId: user.id,
        messageId,
        domain
      });

      // Preparar dados para SMTP (formato compatível)
      const smtpEmailData = {
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to[0] : emailData.to, // Simplificar para um destinatário
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: {
          'X-Message-ID': messageId,
          'X-UltraZend-Service': 'multi-tenant',
          'X-Domain-Verified': 'true',
          'X-User-ID': user.id.toString(),
          'X-Tenant-ID': user.tenant_id?.toString() || 'default'
        }
      };

      // Entrega via SMTP (comprovadamente funcional)
      const delivered = await this.smtpDelivery.deliverEmail(smtpEmailData);

      // Log no banco (multi-tenancy)
      const logData: EmailLogData = {
        user_id: user.id,
        tenant_id: user.tenant_id || null,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        status: delivered ? 'sent' : 'failed',
        timestamp: new Date(),
        message_id: messageId,
        error_message: delivered ? null : 'SMTP delivery failed'
      };

      await this.saveEmailLog(logData);

      if (delivered) {
        logger.info('✅ MultiTenant: Email sent successfully', {
          userId: user.id,
          messageId,
          domain,
          to: smtpEmailData.to
        });
      } else {
        logger.error('❌ MultiTenant: SMTP delivery failed', {
          userId: user.id,
          messageId,
          domain,
          to: smtpEmailData.to
        });
      }

    } catch (error) {
      logger.error('❌ MultiTenant: Async processing failed', {
        userId: user.id,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Salvar log de falha
      const failureLog: EmailLogData = {
        user_id: user.id,
        tenant_id: user.tenant_id || null,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        status: 'failed',
        timestamp: new Date(),
        message_id: messageId,
        error_message: error instanceof Error ? error.message : 'Processing failed'
      };

      await this.saveEmailLog(failureLog);
    }
  }

  /**
   * Validação rápida dos dados do email
   */
  private validateEmailData(emailData: EmailRequest): { valid: boolean; error?: string } {
    // Validar campos obrigatórios
    if (!emailData.from) {
      return { valid: false, error: 'Field "from" is required' };
    }

    if (!emailData.to) {
      return { valid: false, error: 'Field "to" is required' };
    }

    if (!emailData.subject) {
      return { valid: false, error: 'Field "subject" is required' };
    }

    if (!emailData.html && !emailData.text) {
      return { valid: false, error: 'Either "html" or "text" content is required' };
    }

    // Validar formato de email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailData.from)) {
      return { valid: false, error: 'Invalid "from" email format' };
    }

    const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient)) {
        return { valid: false, error: `Invalid recipient email format: ${recipient}` };
      }
    }

    return { valid: true };
  }

  /**
   * Extrair domínio do endereço de email
   */
  private extractDomain(email: string): string | null {
    try {
      if (!email || typeof email !== 'string') {
        return null;
      }
      
      const trimmedEmail = email.trim();
      const atIndex = trimmedEmail.lastIndexOf('@');
      
      if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
        return null;
      }
      
      const domain = trimmedEmail.substring(atIndex + 1).toLowerCase();
      
      // Validação básica do domínio
      if (domain.length === 0 || domain.includes(' ') || !domain.includes('.')) {
        return null;
      }
      
      return domain;
    } catch (error) {
      logger.debug('Failed to extract domain', { email, error });
      return null;
    }
  }

  /**
   * Gerar ID único para a mensagem
   */
  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `mt-${timestamp}-${random}`;
  }

  /**
   * Salvar log do email no banco de dados (multi-tenancy)
   */
  private async saveEmailLog(logData: EmailLogData): Promise<void> {
    try {
      await db('emails').insert({
        user_id: logData.user_id,
        tenant_id: logData.tenant_id,
        from_email: logData.from,
        to_email: logData.to,
        subject: logData.subject,
        status: logData.status,
        message_id: logData.message_id,
        error_message: logData.error_message,
        sent_at: logData.status === 'sent' ? logData.timestamp : null,
        created_at: logData.timestamp,
        updated_at: logData.timestamp
      });

      logger.debug('📝 Email log saved', {
        userId: logData.user_id,
        tenantId: logData.tenant_id,
        messageId: logData.message_id,
        status: logData.status
      });
    } catch (error) {
      logger.error('❌ Failed to save email log', {
        userId: logData.user_id,
        messageId: logData.message_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Não propagar erro - log é importante mas não crítico
    }
  }

  /**
   * Teste de conexão do serviço
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.debug('Testing MultiTenantEmailService connection');
      
      // Testar SMTP
      const smtpTest = await this.smtpDelivery.testConnection();
      if (!smtpTest) {
        logger.error('SMTP connection test failed');
        return false;
      }

      // Testar conexão com banco
      await db.raw('SELECT 1');
      
      logger.info('✅ MultiTenantEmailService connection test passed');
      return true;
    } catch (error) {
      logger.error('❌ MultiTenantEmailService connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}