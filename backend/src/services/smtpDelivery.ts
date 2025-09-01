// Removed inversify dependency temporarily
import { createTransport, Transporter } from 'nodemailer';
import dns from 'dns';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';

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

  constructor() {
    logger.info('SMTPDeliveryService initialized');
  }

  async deliverEmail(emailData: EmailData): Promise<boolean> {
    logger.info('Delivering email', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject
    });

    try {
      const domain = emailData.to.split('@')[1];
      
      // Para desenvolvimento, usar transporter local
      if (Env.isDevelopment) {
        return this.deliverViaLocalTransporter(emailData);
      }

      // Para produção, obter MX records e entregar diretamente
      const mxRecords = await this.getMXRecords(domain);
      if (mxRecords.length === 0) {
        throw new Error(`No MX records found for ${domain}`);
      }

      // Tentar entrega em ordem de prioridade
      for (const mx of mxRecords) {
        try {
          const success = await this.attemptDeliveryViaMX(emailData, mx.exchange);
          if (success) {
            logger.info('Email delivered successfully', {
              to: emailData.to,
              mxServer: mx.exchange
            });
            return true;
          }
        } catch (error) {
          logger.warn('Delivery failed via MX', {
            to: emailData.to,
            mxServer: mx.exchange,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          continue; // Tentar próximo MX
        }
      }

      throw new Error('All MX servers failed');
      
    } catch (error) {
      logger.error('Email delivery failed', {
        to: emailData.to,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async deliverViaLocalTransporter(emailData: EmailData): Promise<boolean> {
    try {
      const transporter = createTransport({
        host: Env.get('SMTP_HOST', 'localhost'),
        port: Env.getNumber('SMTP_PORT', 1025), // MailHog port
        secure: false,
        ignoreTLS: true
      });

      await transporter.sendMail(emailData);
      logger.info('Email delivered via local transporter', { to: emailData.to });
      return true;
    } catch (error) {
      logger.error('Local delivery failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
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

  private async attemptDeliveryViaMX(emailData: EmailData, mxServer: string): Promise<boolean> {
    const transporter = await this.getTransporter(mxServer);
    
    try {
      const result = await transporter.sendMail(emailData);
      logger.info('Email delivered via MX', {
        to: emailData.to,
        mxServer,
        messageId: result.messageId
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
}