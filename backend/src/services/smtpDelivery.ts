// Removed inversify dependency temporarily
import { createTransport, Transporter } from 'nodemailer';
import dns from 'dns';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';
import { DKIMManager } from './dkimManager';

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

  constructor() {
    this.dkimManager = new DKIMManager();
    logger.info('SMTPDeliveryService initialized with DKIM support');
  }

  async deliverEmail(emailData: EmailData): Promise<boolean> {
    logger.info('Delivering email', {
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject
    });

    try {
      // Aplicar assinatura DKIM antes da entrega
      const signedEmailData = await this.dkimManager.signEmail(emailData);
      logger.info('Email signed with DKIM', {
        hasDKIMSignature: !!signedEmailData.dkimSignature,
        from: emailData.from
      });

      const domain = emailData.to.split('@')[1];
      
      // Para desenvolvimento, usar transporter local
      if (Env.isDevelopment) {
        return this.deliverViaLocalTransporter(signedEmailData);
      }

      // Para produção, obter MX records e entregar diretamente
      const mxRecords = await this.getMXRecords(domain);
      if (mxRecords.length === 0) {
        throw new Error(`No MX records found for ${domain}`);
      }

      // Tentar entrega em ordem de prioridade
      for (const mx of mxRecords) {
        try {
          const success = await this.attemptDeliveryViaMX(signedEmailData, mx.exchange);
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

  private async deliverViaLocalTransporter(emailData: any): Promise<boolean> {
    try {
      const transporter = createTransport({
        host: Env.get('SMTP_HOST', 'localhost'),
        port: Env.getNumber('SMTP_PORT', 1025), // MailHog port
        secure: false,
        ignoreTLS: true
      });

      // Preparar dados do email com headers DKIM se disponível
      const mailOptions = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: {
          ...emailData.headers,
          ...(emailData.dkimSignature && { 'DKIM-Signature': emailData.dkimSignature })
        }
      };

      await transporter.sendMail(mailOptions);
      logger.info('Email delivered via local transporter with DKIM', { 
        to: emailData.to,
        hasDKIMSignature: !!emailData.dkimSignature
      });
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

  private async attemptDeliveryViaMX(emailData: any, mxServer: string): Promise<boolean> {
    const transporter = await this.getTransporter(mxServer);
    
    try {
      // Preparar dados do email com headers DKIM se disponível
      const mailOptions = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        headers: {
          ...emailData.headers,
          ...(emailData.dkimSignature && { 'DKIM-Signature': emailData.dkimSignature })
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
}