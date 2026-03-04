import { createTransport, Transporter } from 'nodemailer';
import dns from 'dns';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { DKIMManager } from './dkimManager';
import { buildManagedMailFromDomain } from '../utils/mailFrom';
import { decryptSensitiveValue } from '../utils/crypto';

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
  accountUserId?: number;
}

interface RelayConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  label: string;
}

export class SMTPDeliveryService {
  private connectionPool: Map<string, Transporter> = new Map();
  private dkimManager: DKIMManager;
  private readonly platformMailHostname = Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com.br');

  constructor() {
    this.dkimManager = new DKIMManager();
    logger.info('UltraZend SMTP Server initialized', {
      mode: 'smart-delivery'
    });
  }

  async deliverEmail(emailData: EmailData): Promise<boolean> {
    logger.info('UltraZend SMTP: initiating delivery', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      mode: 'custom-relay -> platform-relay -> direct-mx'
    });

    const signedEmailData = await this.dkimManager.signEmail(emailData);
    logger.info('Email signed with DKIM', {
      hasDKIMSignature: !!signedEmailData.dkimSignature,
      from: emailData.from
    });

    const customRelayConfig = emailData.accountUserId
      ? await this.getCustomSMTPRelayConfig(emailData.accountUserId)
      : null;

    if (customRelayConfig) {
      try {
        const delivered = await this.deliverViaSMTPRelay(signedEmailData, customRelayConfig);
        if (delivered) {
          return true;
        }
      } catch (error) {
        logger.warn('Custom SMTP relay failed, falling back to platform delivery', {
          accountUserId: emailData.accountUserId,
          host: customRelayConfig.host,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const fallbackRelayConfig = this.getFallbackRelayConfig();

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

        if (fallbackRelayConfig) {
          logger.info('Trying platform SMTP fallback in production', {
            to: emailData.to,
            host: fallbackRelayConfig.host
          });
          return this.deliverViaSMTPRelay(signedEmailData, fallbackRelayConfig);
        }

        return false;
      }
    }

    if (fallbackRelayConfig) {
      try {
        logger.debug('Using platform SMTP fallback before direct MX', {
          host: fallbackRelayConfig.host,
          to: emailData.to
        });

        const fallbackResult = await this.deliverViaSMTPRelay(signedEmailData, fallbackRelayConfig);
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

    try {
      return await this.deliverDirectlyViaMX(signedEmailData);
    } catch (error) {
      logger.error('UltraZend SMTP: all delivery methods failed', {
        to: emailData.to,
        domain: emailData.to.split('@')[1],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private getFallbackRelayConfig(): RelayConfig | null {
    if (!process.env.SMTP_FALLBACK_HOST || !process.env.SMTP_FALLBACK_PORT) {
      return null;
    }

    return {
      host: process.env.SMTP_FALLBACK_HOST,
      port: parseInt(process.env.SMTP_FALLBACK_PORT || '587', 10),
      secure: process.env.SMTP_FALLBACK_SECURE === 'true',
      auth: process.env.SMTP_FALLBACK_USER
        ? {
            user: process.env.SMTP_FALLBACK_USER,
            pass: process.env.SMTP_FALLBACK_PASS || ''
          }
        : undefined,
      label: 'platform-fallback'
    };
  }

  private async getCustomSMTPRelayConfig(accountUserId: number): Promise<RelayConfig | null> {
    const settings = await db('user_settings')
      .select(
        'smtp_use_custom',
        'smtp_host',
        'smtp_port',
        'smtp_username',
        'smtp_password_encrypted',
        'smtp_use_tls'
      )
      .where('user_id', accountUserId)
      .first();

    if (!settings?.smtp_use_custom || !settings.smtp_host || !settings.smtp_username || !settings.smtp_password_encrypted) {
      return null;
    }

    const password = decryptSensitiveValue(String(settings.smtp_password_encrypted));
    if (!password) {
      return null;
    }

    return {
      host: String(settings.smtp_host),
      port: Number(settings.smtp_port || 587),
      secure: settings.smtp_use_tls === true,
      auth: {
        user: String(settings.smtp_username),
        pass: password
      },
      label: 'custom-account-relay'
    };
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

  private buildHeaders(emailData: EmailData & { dkimSignature?: string }, envelopeFrom: string): Record<string, string> {
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

  private async deliverViaSMTPRelay(
    emailData: EmailData & { dkimSignature?: string },
    relayConfig: RelayConfig
  ): Promise<boolean> {
    const transporter = createTransport({
      host: relayConfig.host,
      port: relayConfig.port,
      secure: relayConfig.secure,
      auth: relayConfig.auth
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

      logger.info('Email delivered via SMTP relay', {
        to: emailData.to,
        messageId: result.messageId,
        host: relayConfig.host,
        deliveryMode: relayConfig.label
      });

      await this.recordDeliverySuccess(emailData, relayConfig.host);
      transporter.close();
      return true;
    } catch (error) {
      logger.error('SMTP relay delivery failed', {
        to: emailData.to,
        host: relayConfig.host,
        deliveryMode: relayConfig.label,
        error: error instanceof Error ? error.message : String(error)
      });
      await this.recordDeliveryFailure(emailData, error instanceof Error ? error : new Error(String(error)));
      transporter.close();
      return false;
    }
  }

  private async deliverDirectlyViaMX(emailData: EmailData & { dkimSignature?: string }): Promise<boolean> {
    const domain = emailData.to.split('@')[1];
    const mxRecords = await this.getMXRecords(domain);

    if (mxRecords.length === 0) {
      const error = new Error(`No MX records found for domain ${domain}`);
      await this.recordDeliveryFailure(emailData, error);
      throw error;
    }

    logger.info('Found MX records for domain', {
      domain,
      mxCount: mxRecords.length,
      mxServers: mxRecords.map((mx) => `${mx.exchange} (priority: ${mx.priority})`)
    });

    for (const mx of mxRecords) {
      try {
        logger.info('Attempting delivery via MX server', {
          mxServer: mx.exchange,
          priority: mx.priority,
          to: emailData.to
        });

        const success = await this.attemptDeliveryViaMX(emailData, mx.exchange);
        if (success) {
          await this.recordDeliverySuccess(emailData, mx.exchange);
          logger.info('Email delivered successfully', {
            to: emailData.to,
            mxServer: mx.exchange,
            deliveryMode: 'direct-mx'
          });
          return true;
        }
      } catch (error) {
        logger.warn('MX delivery failed, trying next server', {
          to: emailData.to,
          mxServer: mx.exchange,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
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

        const sortedRecords = addresses
          .map((address) => ({
            exchange: address.exchange,
            priority: address.priority
          }))
          .sort((a, b) => a.priority - b.priority);

        resolve(sortedRecords);
      });
    });
  }

  private async attemptDeliveryViaMX(
    emailData: EmailData & { dkimSignature?: string },
    mxServer: string
  ): Promise<boolean> {
    const transporter = await this.getTransporter(mxServer);

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
        transporter.close();
        return true;
      }

      const fallbackRelayConfig = this.getFallbackRelayConfig();
      if (fallbackRelayConfig) {
        const transporter = createTransport({
          host: fallbackRelayConfig.host,
          port: fallbackRelayConfig.port,
          secure: fallbackRelayConfig.secure,
          auth: fallbackRelayConfig.auth
        });
        await transporter.verify();
        transporter.close();
      }

      return true;
    } catch (error) {
      logger.error('SMTP connection test failed', { error });
      return false;
    }
  }

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
    } catch (error) {
      logger.error('Delivery job failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        emailId
      });
      throw error;
    }
  }

  async processEmailQueue(): Promise<void> {
    try {
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
          await db('emails').where('id', email.id).update({
            status: 'processing',
            updated_at: new Date()
          });

          const emailData = {
            from: email.sender_email,
            to: email.recipient_email,
            subject: email.subject,
            html: email.html_content,
            text: email.text_content,
            accountUserId: email.user_id
          };

          const delivered = await this.deliverEmail(emailData);

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

  private async recordDeliverySuccess(emailData: EmailData, mxServer: string): Promise<void> {
    try {
      await db('delivery_stats').insert({
        to_domain: emailData.to.split('@')[1],
        mx_server: mxServer,
        status: 'delivered',
        delivered_at: new Date(),
        from_address: emailData.from
      }).onConflict().ignore();
    } catch (error) {
      logger.debug('Could not record delivery success', {
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
      }).onConflict().ignore();
    } catch (dbError) {
      logger.debug('Could not record delivery failure', {
        dbError: dbError instanceof Error ? dbError.message : 'Unknown'
      });
    }
  }
}
