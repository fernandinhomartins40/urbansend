/**
 * @ultrazend/smtp-internal - SMTP Delivery Service
 * Serviço de entrega SMTP simplificado
 */

import { createTransport, Transporter } from 'nodemailer';
import { SMTPConfig } from '../types';
import { logger } from '../utils/logger';

interface EmailData {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
}

export class SMTPDeliveryService {
  private transporter: Transporter | null = null;
  private config: SMTPConfig;

  constructor(config: SMTPConfig = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 587,
      secure: config.secure || false,
      user: config.user || '',
      password: config.password || '',
      ...config
    };

    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    try {
      const transportConfig: any = {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.user ? {
          user: this.config.user,
          pass: this.config.password
        } : undefined,
        tls: {
          rejectUnauthorized: false // Para desenvolvimento/teste
        }
      };

      this.transporter = createTransport(transportConfig);

      logger.info('SMTP transporter initialized', {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        hasAuth: !!this.config.user
      });
    } catch (error) {
      logger.error('Failed to initialize SMTP transporter', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async deliverEmail(emailData: EmailData): Promise<boolean> {
    if (!this.transporter) {
      logger.error('SMTP transporter not initialized');
      return false;
    }

    try {
      logger.info('Sending email via SMTP', {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject
      });

      const result = await this.transporter.sendMail({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: emailData.headers
      });

      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: emailData.to
      });

      return true;
    } catch (error) {
      logger.error('Failed to send email', {
        to: emailData.to,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('SMTP connection test successful');
      return true;
    } catch (error) {
      logger.error('SMTP connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
      logger.info('SMTP transporter closed');
    }
  }
}