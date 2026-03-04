// Removed inversify dependency temporarily
import { createTransport, Transporter } from 'nodemailer';
import dns from 'dns';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { DKIMManager } from './dkimManager';
import { buildManagedMailFromDomain } from '../utils/mailFrom';

interface MXRecord {
  exchange: string;
  priority: number;
}

interface EmailData {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

export class SMTPDeliveryService {
  private connectionPool: Map<string, Transporter> = new Map();
  private dkimManager: DKIMManager;
  private readonly platformMailHostname = Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br');

  constructor() {
    this.dkimManager = new DKIMManager();
    logger.info('🚀 UltraZend SMTP Server initialized - Direct MX Delivery Mode');
  }

  async deliverEmail(emailData: EmailData): Promise<boolean> {
    logger.info('📧 UltraZend SMTP: Initiating email delivery', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      mode: 'Smart Delivery with Fallback'
    });

    // Aplicar assinatura DKIM antes da entrega
    const signedEmailData = await this.dkimManager.signEmail(emailData);
    logger.info('🔐 Email signed with DKIM', {
      hasDKIMSignature: !!signedEmailData.dkimSignature,
      from: emailData.from
    });

    // Tentar entrega direta primeiro (produção)
    if (Env.isProduction) {
      try {
        const directResult = await this.deliverDirectlyViaMX(signedEmailData);
        if (directResult) {
          return true;
        }
      } catch (error) {
        logger.warn('Direct MX delivery failed in production', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          to: emailData.to 
        });
        // Em produção, tentar fallback apenas se configurado
        if (this.hasSMTPFallbackConfig()) {
          logger.info('Trying SMTP fallback in production', { to: emailData.to });
          return await this.deliverViaSMTPRelay(signedEmailData);
        }
        return false;
      }
    }

    // Em desenvolvimento, tentar fallback SMTP primeiro
    if (this.hasSMTPFallbackConfig()) {
      try {
        logger.debug('Using SMTP fallback for development', { 
          host: process.env.SMTP_FALLBACK_HOST,
          to: emailData.to
        });
        const fallbackResult = await this.deliverViaSMTPRelay(signedEmailData);
        if (fallbackResult) {
          return true;
        }
      } catch (fallbackError) {
        logger.warn('SMTP fallback failed, trying direct delivery', { 
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          to: emailData.to
        });
      }
    }

    // Se fallback falhou ou não configurado, tentar entrega direta
    try {
      return await this.deliverDirectlyViaMX(signedEmailData);
    } catch (error) {
      logger.error('❌ UltraZend SMTP: All delivery methods failed', {
        to: emailData.to,
        domain: emailData.to.split('@')[1],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private hasSMTPFallbackConfig(): boolean {
    return !!(
      process.env.SMTP_FALLBACK_HOST && 
      process.env.SMTP_FALLBACK_PORT
    );
  }

  private buildEnvelopeFrom(emailData: EmailData): string {
    const fromDomain = this.extractDomain(emailData.from);
    const trackingToken = this.sanitizeToken(
      emailData.headers?.['X-Message-ID'] || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    );

    if (!fromDomain || this.isUltraZendDomain(fromDomain)) {
      return `bounce+${trackingToken}@${this.platformMailHostname}`;
    }

    return `bounce+${trackingToken}@${buildManagedMailFromDomain(fromDomain)}`;
  }

  private buildHeaders(emailData: any, envelopeFrom: string): Record<string, string> {
    return {
      ...emailData.headers,
      'Return-Path': `<${envelopeFrom}>`,
      ...(emailData.dkimSignature && { 'DKIM-Signature': emailData.dkimSignature })
    };
  }

  private extractDomain(email: string): string {
    const parts = email.split('@');
    return parts[1]?.trim().toLowerCase() || '';
  }

  private sanitizeToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'email';
  }

  private isUltraZendDomain(domain: string): boolean {
    return ['ultrazend.com.br', 'mail.ultrazend.com.br', 'www.ultrazend.com.br'].includes(domain.toLowerCase());
  }

  private async deliverViaSMTPRelay(emailData: any): Promise<boolean> {
    const transporter = createTransport({
      host: process.env.SMTP_FALLBACK_HOST,
      port: parseInt(process.env.SMTP_FALLBACK_PORT || '587'),
      secure: process.env.SMTP_FALLBACK_SECURE === 'true',
      auth: process.env.SMTP_FALLBACK_USER ? {
        user: process.env.SMTP_FALLBACK_USER,
        pass: process.env.SMTP_FALLBACK_PASS
      } : undefined
    });

    try {
      const envelopeFrom = this.buildEnvelopeFrom(emailData);
      const result = await transporter.sendMail({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: this.buildHeaders(emailData, envelopeFrom),
        envelope: {
          from: envelopeFrom,
          to: emailData.to
        }
      });

      logger.info('📤 Email delivered via SMTP fallback', {
        to: emailData.to,
        messageId: result.messageId,
        host: process.env.SMTP_FALLBACK_HOST,
        deliveryMode: 'SMTP Relay'
      });

      await this.recordDeliverySuccess(emailData, process.env.SMTP_FALLBACK_HOST || 'smtp-fallback');
      return true;
    } catch (error) {
      logger.error('❌ SMTP fallback delivery failed', {
        to: emailData.to,
        host: process.env.SMTP_FALLBACK_HOST,
        error: error instanceof Error ? error.message : String(error)
      });
      await this.recordDeliveryFailure(emailData, error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  private async deliverDirectlyViaMX(emailData: any): Promise<boolean> {
    const domain = emailData.to.split('@')[1];
    
    // 🚀 ULTRAZEND SMTP: Entrega direta aos MX records
    const mxRecords = await this.getMXRecords(domain);
    if (mxRecords.length === 0) {
      const error = new Error(`No MX records found for domain ${domain}`);
      await this.recordDeliveryFailure(emailData, error);
      throw error;
    }

    logger.info('🌐 Found MX records for domain', {
      domain,
      mxCount: mxRecords.length,
      mxServers: mxRecords.map(mx => `${mx.exchange} (priority: ${mx.priority})`)
    });

    // Tentar entrega em ordem de prioridade
    for (const mx of mxRecords) {
      try {
        logger.info('🔄 Attempting delivery via MX server', {
          mxServer: mx.exchange,
          priority: mx.priority,
          to: emailData.to
        });

        const success = await this.attemptDeliveryViaMX(emailData, mx.exchange);
        if (success) {
          await this.recordDeliverySuccess(emailData, mx.exchange);
          logger.info('✅ UltraZend SMTP: Email delivered successfully', {
            to: emailData.to,
            mxServer: mx.exchange,
            deliveryMode: 'Direct MX'
          });
          return true;
        }
      } catch (error) {
        logger.warn('⚠️ MX delivery failed, trying next server', {
          to: emailData.to,
          mxServer: mx.exchange,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        continue; // Tentar próximo MX
      }
    }

    const error = new Error(`All MX servers failed for domain ${domain}`);
    await this.recordDeliveryFailure(emailData, error);
    throw error;
  }

  private async getMXRecords(domain: string): Promise<MXRecord[]> {
    return new Promise((resolve, reject) => {
      dns.resolveMx(domain, (err, addresses) => {
        if (err) {
          reject(err);
          return;
        }

        // Ordenar por prioridade (menor número = maior prioridade)
        const sortedRecords = addresses
          .map(addr => ({
            exchange: addr.exchange,
            priority: addr.priority
          }))
          .sort((a, b) => a.priority - b.priority);

        resolve(sortedRecords);
      });
    });
  }

  private async attemptDeliveryViaMX(emailData: any, mxServer: string): Promise<boolean> {
    const transporter = await this.getTransporter(mxServer);
    
    try {
      // Preparar dados do email com headers DKIM se disponível
      const envelopeFrom = this.buildEnvelopeFrom(emailData);
      const mailOptions = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: this.buildHeaders(emailData, envelopeFrom),
        envelope: {
          from: envelopeFrom,
          to: emailData.to
        }
      };

      const result = await transporter.sendMail(mailOptions);
      logger.info('Email delivered via MX with DKIM', {
        to: emailData.to,
        mxServer,
        messageId: result.messageId,
        hasDKIMSignature: !!emailData.dkimSignature
      });
      return true;
    } catch (error) {
      logger.warn('MX delivery failed', {
        to: emailData.to,
        mxServer,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async getTransporter(mxServer: string): Promise<Transporter> {
    if (this.connectionPool.has(mxServer)) {
      return this.connectionPool.get(mxServer)!;
    }

    const transporter = createTransport({
      host: mxServer,
      port: 25,
      secure: false,
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
      name: Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br'),
      pool: true,
      maxConnections: 5,
      maxMessages: 100
    });

    this.connectionPool.set(mxServer, transporter);
    return transporter;
  }

  async testConnection(): Promise<boolean> {
    try {
      if (Env.isDevelopment) {
        const transporter = createTransport({
          host: Env.get('SMTP_HOST', 'localhost'),
          port: Env.getNumber('SMTP_PORT', 1025),
          secure: false,
          ignoreTLS: true
        });
        await transporter.verify();
        return true;
      }
      return true;
    } catch (error) {
      logger.error('SMTP connection test failed', { error });
      return false;
    }
  }

  // Método para processar jobs de entrega (integração com filas)
  async processDeliveryJob(jobData: any): Promise<void> {
    const { emailData, emailId } = jobData;
    
    logger.info('Processing delivery job', {
      jobId: jobData.id,
      emailId,
      to: emailData.to
    });

    try {
      const delivered = await this.deliverEmail(emailData);
      
      if (!delivered) {
        throw new Error('Delivery failed');
      }
      
      // Atualizar status do email no banco de dados
      // await this.updateEmailStatus(emailId, 'delivered');
      
    } catch (error) {
      logger.error('Delivery job failed', { 
        error: error instanceof Error ? error.message : 'Unknown error', 
        emailId 
      });
      
      // Atualizar status do email como falha
      // await this.updateEmailStatus(emailId, 'failed', error.message);
      throw error; // Will trigger job retry
    }
  }

  // Método para processar fila de emails (chamado pelo scheduler)
  async processEmailQueue(): Promise<void> {
    try {
      // Buscar emails pendentes no banco de dados
      const pendingEmails = await db('emails')
        .where('status', 'queued')
        .orderBy('created_at', 'asc')
        .limit(10);

      if (pendingEmails.length === 0) {
        return;
      }

      logger.info(`Processing ${pendingEmails.length} queued emails`);

      for (const email of pendingEmails) {
        try {
          // Marcar como processando
          await db('emails').where('id', email.id).update({ 
            status: 'processing',
            updated_at: new Date()
          });

          const emailData = {
            from: email.sender_email,
            to: email.recipient_email,
            subject: email.subject,
            html: email.html_content,
            text: email.text_content
          };

          const delivered = await this.deliverEmail(emailData);

          // Atualizar status baseado no resultado
          await db('emails').where('id', email.id).update({
            status: delivered ? 'sent' : 'failed',
            sent_at: delivered ? new Date() : null,
            updated_at: new Date()
          });

          if (delivered) {
            logger.info(`Email ${email.id} delivered successfully`);
          } else {
            logger.error(`Email ${email.id} delivery failed`);
          }

        } catch (error) {
          // Marcar como falha
          await db('emails').where('id', email.id).update({
            status: 'failed',
            updated_at: new Date()
          });

          logger.error(`Email ${email.id} processing failed`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      logger.error('Error processing email queue', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // 📊 Métodos para tracking de deliverability do UltraZend SMTP
  private async recordDeliverySuccess(emailData: EmailData, mxServer: string): Promise<void> {
    try {
      await db('delivery_stats').insert({
        to_domain: emailData.to.split('@')[1],
        mx_server: mxServer,
        status: 'delivered',
        delivered_at: new Date(),
        from_address: emailData.from
      }).onConflict().ignore(); // Ignora se tabela não existe ainda
    } catch (error) {
      logger.debug('Could not record delivery success (table may not exist)', { 
        error: error instanceof Error ? error.message : 'Unknown' 
      });
    }
  }

  private async recordDeliveryFailure(emailData: EmailData, error: Error): Promise<void> {
    try {
      await db('delivery_stats').insert({
        to_domain: emailData.to.split('@')[1],
        status: 'failed',
        error_message: error.message,
        failed_at: new Date(),
        from_address: emailData.from
      }).onConflict().ignore(); // Ignora se tabela não existe ainda
    } catch (dbError) {
      logger.debug('Could not record delivery failure (table may not exist)', { 
        dbError: dbError instanceof Error ? dbError.message : 'Unknown' 
      });
    }
  }
}
