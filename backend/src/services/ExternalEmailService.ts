import { IEmailService, SendEmailOptions, EmailResult } from './IEmailService';
import { DomainValidator, ValidatedSender } from './DomainValidator';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';
import { SMTPDeliveryService } from './smtpDelivery';
import { logger } from '../config/logger';
import { generateTrackingId } from '../utils/crypto';
import { sanitizeEmailHtml } from '../middleware/validation';
import { validateEmailAddress } from '../utils/email';
import db from '../config/database';
import { UserEmailStats, parseCount } from '../types/database';

export interface ExternalEmailServiceOptions {
  domainValidator: DomainValidator;
  dkimManager: MultiDomainDKIMManager;
  enableAuditLogging?: boolean;
  enableTracking?: boolean;
}

export interface EmailAuditLogEntry {
  userId: number;
  emailId: string;
  originalFrom: string;
  finalFrom: string;
  wasModified: boolean;
  modificationReason?: string;
  dkimDomain: string;
  deliveryStatus: 'queued' | 'sent' | 'failed';
  metadata: any;
  timestamp: Date;
}

/**
 * Serviço de email externo para emails dos clientes via API
 * Implementa validação de domínio, fallback automático e auditoria completa
 */
export class ExternalEmailService implements IEmailService {
  private readonly domainValidator: DomainValidator;
  private readonly dkimManager: MultiDomainDKIMManager;
  private readonly smtpDelivery: SMTPDeliveryService;
  private readonly enableAuditLogging: boolean;
  private readonly enableTracking: boolean;

  constructor(options: ExternalEmailServiceOptions) {
    this.domainValidator = options.domainValidator;
    this.dkimManager = options.dkimManager;
    this.smtpDelivery = new SMTPDeliveryService();
    this.enableAuditLogging = options.enableAuditLogging !== false; // Default true
    this.enableTracking = options.enableTracking || false;

    logger.debug('ExternalEmailService initialized', {
      enableAuditLogging: this.enableAuditLogging,
      enableTracking: this.enableTracking
    });
  }

  /**
   * Envia email do cliente com validação completa e fallback
   * 
   * @param emailData - Dados do email a ser enviado
   * @returns Resultado do envio
   */
  async sendEmail(emailData: SendEmailOptions): Promise<EmailResult> {
    const emailId = generateTrackingId();
    const startTime = Date.now();

    try {
      logger.info('Processing external email request', {
        emailId,
        userId: emailData.userId,
        originalFrom: emailData.from,
        to: Array.isArray(emailData.to) ? emailData.to.length + ' recipients' : emailData.to,
        subject: emailData.subject?.substring(0, 50) + (emailData.subject && emailData.subject.length > 50 ? '...' : '')
      });

      // 1. Validação básica dos dados
      const validationResult = this.validateEmailData(emailData);
      if (!validationResult.valid) {
        logger.warn('Email data validation failed', {
          emailId,
          userId: emailData.userId,
          errors: validationResult.errors
        });
        
        return {
          success: false,
          error: `Validation failed: ${validationResult.errors.join(', ')}`
        };
      }

      // 2. Validar e corrigir o domínio do sender
      const validatedSender = await this.domainValidator.validateSenderDomain(
        emailData.userId, 
        emailData.from
      );

      // 3. Obter configuração DKIM apropriada
      const dkimConfig = await this.dkimManager.getDKIMConfigForDomain(
        validatedSender.dkimDomain
      );

      // 🔧 FASE 4.1: Log detalhado de DKIM - CORREÇÃO CRÍTICA
      const extractDomain = (email: string) => {
        const match = email.match(/@(.+)$/);
        return match ? match[1] : null;
      };

      if (!dkimConfig) {
        logger.error('❌ DKIM configuration FAILED to load', {
          emailId,
          userId: emailData.userId,
          fromEmail: emailData.from,
          fromDomain: extractDomain(emailData.from),
          dkimDomain: validatedSender.dkimDomain,
          validatedSender: {
            email: validatedSender.email,
            dkimDomain: validatedSender.dkimDomain,
            valid: validatedSender.valid,
            fallback: validatedSender.fallback || false,
            reason: validatedSender.reason
          },
          configFound: !!dkimConfig,
          timestamp: new Date().toISOString()
        });

        return {
          success: false,
          error: 'DKIM configuration not available'
        };
      }

      // ✅ SUCESSO: Log detalhado quando DKIM é aplicado corretamente
      logger.info('✅ DKIM configuration successfully applied', {
        emailId,
        userId: emailData.userId,
        fromEmail: emailData.from,
        fromDomain: extractDomain(emailData.from),
        dkimDomain: validatedSender.dkimDomain,
        validatedSender: {
          email: validatedSender.email,
          dkimDomain: validatedSender.dkimDomain,
          valid: validatedSender.valid,
          fallback: validatedSender.fallback || false,
          reason: validatedSender.reason || 'Domain verified and owned'
        },
        dkimConfig: {
          selector: dkimConfig.selector,
          hasDKIMKey: !!dkimConfig.privateKey,
          keyLength: dkimConfig.privateKey ? dkimConfig.privateKey.length : 0
        },
        wasForced: validatedSender.fallback || false,
        configFound: !!dkimConfig,
        domainStatus: extractDomain(emailData.from) === validatedSender.dkimDomain ? 'original' : 'fallback',
        timestamp: new Date().toISOString()
      });

      // 4. Preparar dados do email com configurações corretas
      const processedEmailData = await this.prepareEmailForDelivery(
        emailData, 
        validatedSender, 
        emailId
      );

      // 5. Log de auditoria antes do envio
      await this.logEmailAudit({
        userId: emailData.userId,
        emailId,
        originalFrom: emailData.from,
        finalFrom: validatedSender.email,
        wasModified: validatedSender.fallback || false,
        modificationReason: validatedSender.reason,
        dkimDomain: validatedSender.dkimDomain,
        deliveryStatus: 'queued',
        metadata: {
          recipients: Array.isArray(emailData.to) ? emailData.to.length : 1,
          hasHtml: !!emailData.html,
          hasText: !!emailData.text,
          hasAttachments: emailData.attachments && emailData.attachments.length > 0,
          template_id: emailData.template_id,
          tracking: emailData.tracking,
          processingTimeMs: Date.now() - startTime
        },
        timestamp: new Date()
      });

      // 6. Entregar via SMTP
      const deliverySuccess = await this.smtpDelivery.deliverEmail(processedEmailData);

      // 7. Atualizar log de auditoria com resultado
      const deliveryStatus = deliverySuccess ? 'sent' : 'failed';
      await this.updateEmailAuditStatus(emailId, deliveryStatus);

      // 8. Preparar resposta
      const result: EmailResult = {
        success: deliverySuccess,
        messageId: emailId
      };

      if (deliverySuccess) {
        result.deliveredTo = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
        
        logger.info('External email sent successfully', {
          emailId,
          userId: emailData.userId,
          finalFrom: validatedSender.email,
          wasModified: validatedSender.fallback || false,
          processingTimeMs: Date.now() - startTime
        });
      } else {
        result.error = 'SMTP delivery failed';
        result.rejectedRecipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
        
        logger.error('External email delivery failed', {
          emailId,
          userId: emailData.userId,
          finalFrom: validatedSender.email,
          processingTimeMs: Date.now() - startTime
        });
      }

      return result;

    } catch (error) {
      logger.error('External email service error', {
        emailId,
        userId: emailData.userId,
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime
      });

      // Log de auditoria para erro
      await this.logEmailAudit({
        userId: emailData.userId,
        emailId,
        originalFrom: emailData.from,
        finalFrom: emailData.from, // Manter original em caso de erro
        wasModified: false,
        dkimDomain: 'ultrazend.com.br',
        deliveryStatus: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          processingTimeMs: Date.now() - startTime
        },
        timestamp: new Date()
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Testa conexão do serviço
   * 
   * @returns true se conexão está funcionando
   */
  async testConnection(): Promise<boolean> {
    try {
      logger.debug('Testing external email service connection');
      
      // Testar componentes principais
      const domainValidatorTest = await this.domainValidator.canUserSendFromEmail(
        1, 'test@ultrazend.com.br'
      );
      
      const dkimConfigTest = await this.dkimManager.getDKIMConfigForDomain('ultrazend.com.br');
      
      const connectionValid = domainValidatorTest && dkimConfigTest !== null;
      
      logger.debug('External email service connection test completed', {
        domainValidatorTest,
        hasDkimConfig: dkimConfigTest !== null,
        connectionValid
      });
      
      return connectionValid;
    } catch (error) {
      logger.error('External email service connection test failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Valida dados básicos do email
   * 
   * @param emailData - Dados do email
   * @returns Resultado da validação
   */
  private validateEmailData(emailData: SendEmailOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validar from
    if (!emailData.from || !validateEmailAddress(emailData.from)) {
      errors.push('Invalid from email address');
    }

    // Validar to
    if (!emailData.to) {
      errors.push('To field is required');
    } else {
      const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      for (const recipient of recipients) {
        if (!validateEmailAddress(recipient)) {
          errors.push(`Invalid recipient email: ${recipient}`);
        }
      }
    }

    // Validar subject
    if (!emailData.subject || emailData.subject.trim().length === 0) {
      errors.push('Subject is required');
    }

    // Validar conteúdo
    if (!emailData.html && !emailData.text) {
      errors.push('Email must have either HTML or text content');
    }

    // Validar userId
    if (!emailData.userId || emailData.userId <= 0) {
      errors.push('Valid userId is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Prepara email para entrega com todas as configurações aplicadas
   * 
   * @param emailData - Dados originais do email
   * @param validatedSender - Sender validado
   * @param emailId - ID do email
   * @returns Dados preparados para entrega
   */
  private async prepareEmailForDelivery(
    emailData: SendEmailOptions, 
    validatedSender: ValidatedSender, 
    emailId: string
  ): Promise<any> {
    // Preparar headers customizados
    const customHeaders: Record<string, string> = {
      'X-Email-ID': emailId,
      'X-UltraZend-Service': 'external',
      'X-User-ID': emailData.userId.toString(),
      'X-DKIM-Domain': validatedSender.dkimDomain
    };

    if (validatedSender.fallback) {
      customHeaders['X-Sender-Corrected'] = 'true';
      customHeaders['X-Correction-Reason'] = validatedSender.reason || 'Domain validation';
      customHeaders['X-Original-From'] = emailData.from;
    }

    if (emailData.apiKeyId) {
      customHeaders['X-API-Key-ID'] = emailData.apiKeyId.toString();
    }

    // Processar conteúdo HTML (sanitização já aplicada pelo middleware)
    let processedHtml = emailData.html;
    let processedText = emailData.text;

    // Adicionar tracking se habilitado
    if (this.enableTracking && emailData.tracking) {
      if (processedHtml) {
        processedHtml = this.addTrackingToHtml(processedHtml, emailId);
      }
    }

    // Preparar dados finais
    const emailForDelivery = {
      from: validatedSender.email,
      to: emailData.to,
      subject: emailData.subject,
      html: processedHtml,
      text: processedText,
      cc: emailData.cc,
      bcc: emailData.bcc,
      replyTo: emailData.replyTo || validatedSender.email, // Usar sender validado como reply-to padrão
      attachments: emailData.attachments,
      headers: customHeaders
    };

    return emailForDelivery;
  }

  /**
   * Adiciona pixel de tracking ao HTML
   * 
   * @param html - HTML original
   * @param emailId - ID do email
   * @returns HTML com tracking
   */
  private addTrackingToHtml(html: string, emailId: string): string {
    const trackingPixel = `<img src="https://ultrazend.com.br/track/open/${emailId}" width="1" height="1" style="display:none;" alt="">`;
    
    // Adicionar antes da tag de fechamento do body se existir
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    
    // Caso contrário, adicionar no final
    return html + trackingPixel;
  }

  /**
   * Registra entrada no log de auditoria
   * 
   * @param logEntry - Dados do log
   */
  private async logEmailAudit(logEntry: EmailAuditLogEntry): Promise<void> {
    if (!this.enableAuditLogging) {
      return;
    }

    try {
      // Verificar se tabela existe antes de tentar inserir
      const hasTable = await db.schema.hasTable('email_audit_logs');
      if (!hasTable) {
        logger.warn('Email audit table does not exist, skipping audit log');
        return;
      }

      await db('email_audit_logs').insert({
        user_id: logEntry.userId,
        email_id: logEntry.emailId,
        original_from: logEntry.originalFrom,
        final_from: logEntry.finalFrom,
        was_modified: logEntry.wasModified,
        modification_reason: logEntry.modificationReason,
        dkim_domain: logEntry.dkimDomain,
        delivery_status: logEntry.deliveryStatus,
        metadata: JSON.stringify(logEntry.metadata),
        timestamp: logEntry.timestamp
      });

      logger.debug('Email audit log recorded', {
        emailId: logEntry.emailId,
        userId: logEntry.userId
      });
    } catch (error) {
      logger.error('Failed to record email audit log', {
        emailId: logEntry.emailId,
        userId: logEntry.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Não re-lançar o erro para não impedir o envio do email
    }
  }

  /**
   * Atualiza status de entrega no log de auditoria
   * 
   * @param emailId - ID do email
   * @param status - Novo status
   */
  private async updateEmailAuditStatus(emailId: string, status: 'sent' | 'failed'): Promise<void> {
    if (!this.enableAuditLogging) {
      return;
    }

    try {
      const hasTable = await db.schema.hasTable('email_audit_logs');
      if (!hasTable) {
        return;
      }

      const updateCount = await db('email_audit_logs')
        .where('email_id', emailId)
        .update({
          delivery_status: status,
          timestamp: new Date() // Atualizar timestamp com horário da entrega
        });

      if (updateCount === 0) {
        logger.warn('No audit log found to update', { emailId, status });
      }
    } catch (error) {
      logger.error('Failed to update email audit status', {
        emailId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Obtém estatísticas de envio para um usuário
   * 
   * @param userId - ID do usuário
   * @param days - Número de dias para buscar (padrão 30)
   * @returns Estatísticas de envio
   */
  async getEmailStats(userId: number, days: number = 30): Promise<{
    totalEmails: number;
    sentEmails: number;
    failedEmails: number;
    modifiedEmails: number;
    deliveryRate: number;
    modificationRate: number;
  }> {
    try {
      const hasTable = await db.schema.hasTable('email_audit_logs');
      if (!hasTable) {
        logger.warn('Email audit table does not exist, returning zero stats');
        return {
          totalEmails: 0,
          sentEmails: 0,
          failedEmails: 0,
          modifiedEmails: 0,
          deliveryRate: 0,
          modificationRate: 0
        };
      }

      const stats = await db('email_audit_logs')
        .select(
          db.raw('COUNT(*) as total_emails'),
          db.raw('SUM(CASE WHEN delivery_status = \'sent\' THEN 1 ELSE 0 END) as sent_emails'),
          db.raw('SUM(CASE WHEN delivery_status = \'failed\' THEN 1 ELSE 0 END) as failed_emails'),
          db.raw('SUM(CASE WHEN was_modified = true THEN 1 ELSE 0 END) as modified_emails')
        )
        .where('user_id', userId)
        .where('timestamp', '>=', db.raw(`datetime('now', '-${days} days')`))
        .first();

      const emailStats = stats as any;
      const totalEmails = parseCount(emailStats.total_emails);
      const sentEmails = parseCount(emailStats.sent_emails);
      const failedEmails = parseCount(emailStats.failed_emails);
      const modifiedEmails = parseCount(emailStats.modified_emails);

      return {
        totalEmails,
        sentEmails,
        failedEmails,
        modifiedEmails,
        deliveryRate: totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0,
        modificationRate: totalEmails > 0 ? (modifiedEmails / totalEmails) * 100 : 0
      };
    } catch (error) {
      logger.error('Failed to get email stats', {
        userId,
        days,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalEmails: 0,
        sentEmails: 0,
        failedEmails: 0,
        modifiedEmails: 0,
        deliveryRate: 0,
        modificationRate: 0
      };
    }
  }
}