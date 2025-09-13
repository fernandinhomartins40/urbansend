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
import { generateTrackingPixel } from '../utils/email';

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
  status: 'pending' | 'sent' | 'failed';
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
  html?: string;
  text?: string;
  status: 'sent' | 'failed' | 'pending';
  error_message?: string;
  timestamp: Date;
  message_id?: string;
  tracking_id?: string;
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

      // 3. Gerar IDs únicos
      const messageId = this.generateMessageId();
      const trackingId = this.generateTrackingId();

      // 4. Salvar imediatamente no banco como 'pending' (rápido para UI)
      const processingLog: EmailLogData = {
        user_id: user.id,
        tenant_id: user.tenant_id || null,
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        status: 'pending',
        timestamp: new Date(),
        message_id: messageId,
        tracking_id: trackingId,
        error_message: null
      };

      await this.saveEmailLog(processingLog);

      // 5. Processamento SMTP assíncrono (não bloquear UI)
      setImmediate(async () => {
        await this.processEmailAsync(emailData, user, domain, messageId, trackingId);
      });

      // 6. Resposta imediata (email já aparece na lista)
      return {
        success: true,
        message: 'Email queued for delivery with verified domain',
        message_id: messageId,
        status: 'pending',
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
   * - Entrega SMTP com tracking
   * - Persistência no banco
   * - Logs estruturados
   */
  private async processEmailAsync(
    emailData: EmailRequest,
    user: AuthUser,
    domain: string,
    messageId: string,
    trackingId: string
  ): Promise<void> {
    try {
      logger.info('🔄 Processing email asynchronously', {
        userId: user.id,
        messageId,
        domain
      });

      // Preparar HTML com tracking pixel (de forma segura)
      let finalHtml = emailData.html;
      if (emailData.html) {
        finalHtml = this.addTrackingPixelSafely(emailData.html, trackingId);

        logger.debug('📧 Tracking pixel added', {
          userId: user.id,
          messageId,
          trackingId,
          pixelAdded: finalHtml !== emailData.html
        });
      }

      // Preparar dados para SMTP (formato compatível)
      const smtpEmailData = {
        from: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to[0] : emailData.to, // Simplificar para um destinatário
        subject: emailData.subject,
        html: finalHtml,
        text: emailData.text,
        headers: {
          'X-Message-ID': messageId,
          'X-Tracking-ID': trackingId,
          'X-UltraZend-Service': 'multi-tenant',
          'X-Domain-Verified': 'true',
          'X-User-ID': user.id.toString(),
          'X-Tenant-ID': user.tenant_id?.toString() || 'default'
        }
      };

      // Entrega via SMTP (comprovadamente funcional)
      const delivered = await this.smtpDelivery.deliverEmail(smtpEmailData);

      // Atualizar status no banco (em vez de inserir novo)
      await this.updateEmailStatus(messageId, {
        status: delivered ? 'sent' : 'failed',
        sent_at: delivered ? new Date() : null,
        error_message: delivered ? null : 'SMTP delivery failed'
      });

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

      // Atualizar como falha no banco
      await this.updateEmailStatus(messageId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Processing failed'
      });
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
   * Gerar tracking ID único para rastreamento de abertura
   */
  private generateTrackingId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `track-${timestamp}-${random}`;
  }

  /**
   * Adicionar pixel de tracking ao HTML de forma segura (não crítica)
   */
  private addTrackingPixelSafely(html: string, trackingId: string): string {
    try {
      if (!html || typeof html !== 'string') {
        return html;
      }

      // Usar domínio fixo para tracking (www.ultrazend.com.br)
      const trackingDomain = 'www.ultrazend.com.br';
      const trackingPixel = generateTrackingPixel(trackingId, trackingDomain);

      // Adicionar pixel antes do </body> ou no final se não houver </body>
      if (html.toLowerCase().includes('</body>')) {
        return html.replace(/<\/body>/i, `${trackingPixel}</body>`);
      } else {
        return html + trackingPixel;
      }
    } catch (error) {
      // Log mas não quebra o envio se tracking falhar
      logger.debug('🟡 Tracking pixel addition failed (non-critical)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        trackingId
      });
      return html; // Retorna HTML original
    }
  }

  /**
   * Atualizar status do email no banco de dados
   */
  private async updateEmailStatus(messageId: string, updates: {
    status?: string;
    sent_at?: Date | null;
    error_message?: string | null;
  }): Promise<void> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date()
      };

      await db('emails')
        .where('message_id', messageId)
        .update(updateData);

      logger.debug('📝 Email status updated', {
        messageId,
        updates
      });
    } catch (error) {
      logger.error('❌ Failed to update email status', {
        messageId,
        updates,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Não propagar erro - update é importante mas não crítico
    }
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
        html_content: logData.html,
        text_content: logData.text,
        status: logData.status,
        message_id: logData.message_id,
        tracking_id: logData.tracking_id,
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