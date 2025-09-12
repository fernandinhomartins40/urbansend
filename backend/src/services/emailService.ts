import { createTransport, Transporter } from 'nodemailer';
import fs from 'fs';
import { logger } from '../config/logger';
import { validateEmailAddress, processTemplate, generateTrackingPixel, processLinksForTracking } from '../utils/email';
import { generateTrackingId } from '../utils/crypto';
import { sanitizeEmailHtml } from '../middleware/validation';
import db from '../config/database';
import { Env } from '../utils/env';
import { SMTPDeliveryService } from './smtpDelivery';
import { queueService } from './queueService';

interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
  encoding?: string;
}

interface SendEmailOptions {
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

export class EmailService {
  private transporter!: Transporter;
  private dkimPrivateKey: string | null = null;
  private smtpDelivery: SMTPDeliveryService;

  constructor() {
    this.smtpDelivery = new SMTPDeliveryService();
    this.initializeTransporter();
    this.loadDkimKey();
  }

  private initializeTransporter() {
    const config = {
      host: process.env['SMTP_HOST'] || 'localhost',
      port: parseInt(process.env['SMTP_PORT'] || '587', 10),
      secure: process.env['SMTP_SECURE'] === 'true',
      auth: (process.env['SMTP_USER'] && process.env['SMTP_PASS']) ? {
        user: process.env['SMTP_USER'],
        pass: process.env['SMTP_PASS']
      } : undefined,
      dkim: this.dkimPrivateKey ? {
        domainName: process.env['DKIM_DOMAIN'] || 'localhost',
        keySelector: process.env['DKIM_SELECTOR'] || 'default',
        privateKey: this.dkimPrivateKey
      } : undefined
    };

    this.transporter = createTransport(config);
  }

  private loadDkimKey() {
    const keyPath = process.env['DKIM_PRIVATE_KEY_PATH'];
    if (keyPath && fs.existsSync(keyPath)) {
      try {
        this.dkimPrivateKey = fs.readFileSync(keyPath, 'utf8');
        logger.info('DKIM private key loaded successfully');
      } catch (error) {
        logger.warn('Failed to load DKIM private key', { error });
      }
    }
  }

  private async validateRecipients(recipients: string | string[]): Promise<void> {
    const emails = Array.isArray(recipients) ? recipients : [recipients];
    
    for (const email of emails) {
      const validation = await validateEmailAddress(email);
      if (!validation.isValid) {
        throw new Error(`Invalid recipient email ${email}: ${validation.reason}`);
      }
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    logger.info('Sending verification email', { 
      email, 
      name, 
      tokenLength: token.length,
      tokenPreview: token.substring(0, 8) + '...'
    });

    // Implementação sem dependência circular
    const emailData = this.buildVerificationEmail(email, name, token);
    
    // Usar SMTP delivery via injeção de dependência
    await this.smtpDelivery.deliverEmail(emailData);
    
    logger.info('Verification email sent successfully', { email });
  }

  private buildVerificationEmail(email: string, name: string, token: string) {
    const frontendUrl = Env.get('FRONTEND_URL', 'https://www.ultrazend.com.br');
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;
    
    return {
      from: `noreply@ultrazend.com.br`,
      to: email,
      subject: 'Verifique seu email - UltraZend',
      html: this.generateVerificationEmailHTML(name, verificationUrl),
      text: this.generateVerificationEmailText(name, verificationUrl)
    };
  }

  private generateVerificationEmailHTML(name: string, verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verifique seu email - UltraZend</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 10px; margin-bottom: 20px; }
          .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">UltraZend</div>
        </div>
        <div class="content">
          <h2>Olá, ${name}!</h2>
          <p>Obrigado por se registrar no UltraZend. Para completar seu cadastro, clique no botão abaixo para verificar seu email:</p>
          <p style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verificar Email</a>
          </p>
          <p>Ou copie e cole este link no seu navegador:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">
            ${verificationUrl}
          </p>
          <p><strong>Este link expira em 24 horas.</strong></p>
          <p>Se você não se cadastrou no UltraZend, ignore este email.</p>
        </div>
        <div class="footer">
          <p>© 2024 UltraZend. Todos os direitos reservados.</p>
        </div>
      </body>
      </html>
    `;
  }

  private generateVerificationEmailText(name: string, verificationUrl: string): string {
    return `
      Olá, ${name}!

      Obrigado por se registrar no UltraZend. Para completar seu cadastro, acesse o link abaixo para verificar seu email:

      ${verificationUrl}

      Este link expira em 24 horas.

      Se você não se cadastrou no UltraZend, ignore este email.

      Atenciosamente,
      Equipe UltraZend
    `;
  }

  // Métodos para processamento de jobs (integração com filas)
  async processEmailJob(jobData: any): Promise<any> {
    logger.info('Processando job de email via fila', { jobData });

    try {
      const {
        emailId,
        campaignId,
        userId,
        from,
        to,
        subject,
        html,
        text,
        attachments,
        trackingEnabled,
        template,
        variables,
        priority
      } = jobData;

      // Validar destinatários
      await this.validateRecipients(to);

      // Processar template se fornecido
      let processedHtml = html;
      let processedText = text;
      
      if (template && variables) {
        processedHtml = processTemplate(template.html, variables);
        processedText = processTemplate(template.text, variables);
      }

      // Adicionar tracking se habilitado
      if (trackingEnabled && emailId) {
        const trackingPixel = generateTrackingPixel(emailId.toString(), 'open');
        processedHtml = processedHtml + trackingPixel;
        processedHtml = processLinksForTracking(processedHtml, emailId.toString(), 'click');
      }

      // Sanitizar HTML
      if (processedHtml) {
        processedHtml = sanitizeEmailHtml(processedHtml);
      }

      // Preparar dados para envio
      const emailData = {
        from,
        to,
        subject,
        html: processedHtml,
        text: processedText,
        attachments
      };

      // Gerar tracking ID se não fornecido
      const trackingId = emailId || generateTrackingId();

      // Enviar via SMTP delivery PRIMEIRO
      const result = await this.smtpDelivery.deliverEmail(emailData);

      // Registrar email na tabela emails APENAS APÓS envio bem-sucedido
      const dbEmailId = await this.insertEmailRecord({
        userId,
        from,
        to: Array.isArray(to) ? to.join(',') : to,
        subject,
        html: processedHtml,
        text: processedText,
        tracking_id: trackingId,
        status: 'delivered', // Já nasce como delivered pois foi enviado
        campaign_id: campaignId,
        priority,
        sent_at: new Date()
      });

      // Registrar evento de envio
      await this.recordEmailEvent(emailId, 'sent', {
        campaignId,
        userId,
        recipientEmail: Array.isArray(to) ? to[0] : to,
        domain: this.extractDomainFromEmail(Array.isArray(to) ? to[0] : to),
        result
      });

      logger.info('Email enviado com sucesso via fila', { emailId, result });
      return { success: true, emailId, result };

    } catch (error) {
      logger.error('Erro ao processar job de email:', error);
      
      // Registrar email como failed APENAS se houve erro no envio
      if (jobData.userId) {
        try {
          const trackingId = jobData.emailId || generateTrackingId();
          
          // Registrar o email como failed no banco
          await this.insertEmailRecord({
            userId: jobData.userId,
            from: jobData.from,
            to: Array.isArray(jobData.to) ? jobData.to.join(',') : jobData.to,
            subject: jobData.subject,
            html: jobData.html,
            text: jobData.text,
            tracking_id: trackingId,
            status: 'failed',
            campaign_id: jobData.campaignId,
            priority: jobData.priority,
            error_message: (error as Error).message
          });

          // Registrar evento de falha
          await this.recordEmailEvent(trackingId, 'failed', {
            error: (error as Error).message,
            campaignId: jobData.campaignId,
            userId: jobData.userId
          });
        } catch (insertError) {
          logger.error('Erro ao registrar email falhado:', insertError);
        }
      }

      throw error;
    }
  }

  async processBatchEmailJob(jobData: any): Promise<any> {
    logger.info('Processando job de batch de emails via fila', { 
      batchId: jobData.batchId,
      emailCount: jobData.emails?.length 
    });

    try {
      const { batchId, emails, template, variables, trackingEnabled } = jobData;
      const results: any[] = [];
      const errors: any[] = [];

      // Processar emails em lotes menores para evitar sobrecarga
      const batchSize = 10;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (emailData: any) => {
          try {
            // Processar cada email individual
            const result = await this.processEmailJob({
              ...emailData,
              template,
              variables: { ...variables, ...emailData.variables },
              trackingEnabled
            });
            
            results.push(result);
            return result;
          } catch (error) {
            logger.error('Erro ao processar email no batch:', error);
            errors.push({
              emailId: emailData.emailId,
              error: (error as Error).message
            });
            return null;
          }
        });

        await Promise.allSettled(batchPromises);
      }

      // Registrar estatísticas do batch
      await this.recordBatchStats(batchId, {
        totalEmails: emails.length,
        successCount: results.length,
        errorCount: errors.length,
        errors
      });

      logger.info('Batch de emails processado', {
        batchId,
        total: emails.length,
        success: results.length,
        errors: errors.length
      });

      return {
        success: true,
        batchId,
        processed: emails.length,
        successful: results.length,
        failed: errors.length,
        errors
      };

    } catch (error) {
      logger.error('Erro ao processar batch de emails:', error);
      throw error;
    }
  }

  private async recordEmailEvent(emailId: string, eventType: string, data: any): Promise<void> {
    try {
      // Enviar evento para AnalyticsService via Queue
      await queueService.addAnalyticsJob({
        type: 'email_event',
        emailId: emailId.toString(),
        eventType,
        campaignId: data.campaignId,
        userId: data.userId?.toString(),
        timestamp: new Date(),
        data: {
          recipientEmail: data.recipientEmail,
          domain: data.domain,
          result: data.result,
          error: data.error
        }
      });

    } catch (error) {
      logger.error('Erro ao registrar evento de email:', error);
    }
  }

  private async recordBatchStats(batchId: string, stats: any): Promise<void> {
    try {
      await db.raw(`
        INSERT INTO batch_stats (
          batch_id, total_emails, successful_emails, failed_emails,
          error_details, created_at
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `, [
        batchId,
        stats.totalEmails,
        stats.successCount,
        stats.errorCount,
        JSON.stringify(stats.errors)
      ]);
    } catch (error) {
      logger.error('Erro ao registrar estatísticas do batch:', error);
    }
  }

  private extractDomainFromEmail(email: string): string {
    return email.split('@')[1] || 'unknown';
  }

  private async insertEmailRecord(emailData: any): Promise<number> {
    try {
      const insertData: any = {
        user_id: emailData.userId,
        message_id: emailData.tracking_id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from_email: emailData.from,
        to_email: emailData.to,
        subject: emailData.subject,
        html_content: emailData.html,
        text_content: emailData.text,
        status: emailData.status || 'pending',
        campaign_id: emailData.campaign_id,
        metadata: JSON.stringify({ priority: emailData.priority || 0 }),
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      };

      // Adicionar campos opcionais se fornecidos
      if (emailData.sent_at) {
        insertData.sent_at = emailData.sent_at;
      }
      
      if (emailData.error_message) {
        insertData.error_message = emailData.error_message;
      }

      const [emailId] = await db('emails').insert(insertData);

      logger.info('Email registrado na tabela emails', { 
        emailId, 
        messageId: emailData.tracking_id,
        to: emailData.to,
        status: emailData.status 
      });

      return emailId;
    } catch (error) {
      logger.error('Erro ao inserir email na tabela:', error);
      throw error;
    }
  }

  private async updateEmailStatus(emailId: number, status: string, data?: any): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: db.fn.now()
      };

      if (data?.message_id) {
        updateData.message_id = data.message_id;
      }

      if (data?.sent_at) {
        updateData.sent_at = data.sent_at;
      }

      if (data?.error_message) {
        updateData.error_message = data.error_message;
      }

      await db('emails')
        .where('id', emailId)
        .update(updateData);

      logger.info('Status do email atualizado', { emailId, status });
    } catch (error) {
      logger.error('Erro ao atualizar status do email:', error);
      throw error;
    }
  }

  // Método para teste de conexão
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection test successful');
      return true;
    } catch (error) {
      logger.error('SMTP connection test failed', { error });
      return false;
    }
  }
}