import { logger } from '../config/logger';
import { ReputationManager } from './reputationManager';
import { DKIMManager } from './dkimManager';
import { SecurityManager } from './SecurityManager';
import { createTransport, Transporter, SendMailOptions } from 'nodemailer';
import { simpleParser } from 'mailparser';
import db from '../config/database';
import { Env } from '../utils/env';

export interface DeliveryConfig {
  maxConcurrentDeliveries: number;
  retryAttempts: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxRetryDelayMs: number;
  deliveryTimeout: number;
  enableFeedbackLoop: boolean;
  enableBounceHandling: boolean;
}

export interface EmailDelivery {
  id?: number;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  headers: any;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'bounced' | 'deferred';
  attempts: number;
  lastAttempt?: Date;
  nextAttempt?: Date;
  errorMessage?: string;
  deliveredAt?: Date;
  priority: number;
  userId?: number;
  campaignId?: number;
  bounceType?: string;
  deliveryReport?: any;
}

export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  bounced?: boolean;
  bounceType?: string;
  statusCode?: number;
  enhancedStatusCode?: string;
  deliveryTime?: number;
}

export interface DeliveryQueueStats {
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  bounced: number;
  deferred: number;
  totalToday: number;
  averageDeliveryTime: number;
}

export class DeliveryManager {
  private config: DeliveryConfig;
  private reputationManager: ReputationManager;
  private dkimManager: DKIMManager;
  private securityManager: SecurityManager;
  private isProcessing = false;
  private activeDeliveries = 0;
  private deliveryQueue: Map<number, NodeJS.Timeout> = new Map();
  private transporter: Transporter;

  constructor(
    reputationManager: ReputationManager,
    dkimManager: DKIMManager,
    securityManager: SecurityManager,
    config: Partial<DeliveryConfig> = {}
  ) {
    this.config = {
      maxConcurrentDeliveries: 10,
      retryAttempts: 5,
      retryDelayMs: 60000, // 1 minuto
      backoffMultiplier: 2,
      maxRetryDelayMs: 3600000, // 1 hora
      deliveryTimeout: 30000, // 30 segundos
      enableFeedbackLoop: true,
      enableBounceHandling: true,
      ...config
    };

    this.reputationManager = reputationManager;
    this.dkimManager = dkimManager;
    this.securityManager = securityManager;

    this.setupTransporter();
    this.createDeliveryTables();
    this.startDeliveryProcessor();
  }

  private setupTransporter(): void {
    this.transporter = createTransport({
      host: Env.get('SMTP_HOST', 'localhost'),
      port: Env.getNumber('SMTP_PORT', 25),
      secure: false, // Use STARTTLS
      requireTLS: true,
      auth: Env.isDevelopment ? undefined : {
        user: Env.get('SMTP_USER'),
        pass: Env.get('SMTP_PASS')
      },
      connectionTimeout: this.config.deliveryTimeout,
      greetingTimeout: this.config.deliveryTimeout,
      socketTimeout: this.config.deliveryTimeout,
      logger: false,
      debug: false
    });
  }

  public async queueEmail(emailData: Partial<EmailDelivery>): Promise<number> {
    try {
      // Validar dados obrigatórios
      if (!emailData.from || !emailData.to || !emailData.subject || !emailData.body) {
        throw new Error('Missing required email fields');
      }

      // Gerar messageId se não fornecido
      if (!emailData.messageId) {
        emailData.messageId = this.generateMessageId(emailData.from);
      }

      // Verificar reputação do domínio antes de enfileirar
      const domain = this.extractDomain(emailData.to);
      const reputationCheck = await this.reputationManager.checkDeliveryAllowed(domain);
      
      if (!reputationCheck.allowed && reputationCheck.recommendations?.includes('block')) {
        throw new Error(`Delivery blocked for domain ${domain}: ${reputationCheck.reason}`);
      }

      // Determinar prioridade baseada na reputação
      const priority = this.calculatePriority(reputationCheck, emailData.priority || 0);

      // Inserir na fila de entrega
      const [deliveryId] = await db('email_delivery_queue').insert({
        message_id: emailData.messageId,
        from_address: emailData.from,
        to_address: emailData.to,
        subject: emailData.subject,
        body: emailData.body,
        headers: JSON.stringify(emailData.headers || {}),
        status: 'pending',
        attempts: 0,
        priority,
        user_id: emailData.userId,
        campaign_id: emailData.campaignId,
        created_at: new Date(),
        next_attempt: new Date()
      });

      logger.info('Email queued for delivery', {
        deliveryId,
        messageId: emailData.messageId,
        from: emailData.from,
        to: emailData.to,
        priority
      });

      return deliveryId;

    } catch (error) {
      logger.error('Failed to queue email', { error, emailData });
      throw error;
    }
  }

  public async processDelivery(deliveryId: number): Promise<DeliveryResult> {
    try {
      // Buscar email na fila
      const delivery = await db('email_delivery_queue')
        .where('id', deliveryId)
        .where('status', 'pending')
        .first();

      if (!delivery) {
        throw new Error(`Delivery ${deliveryId} not found or not pending`);
      }

      // Marcar como processando
      await db('email_delivery_queue')
        .where('id', deliveryId)
        .update({
          status: 'processing',
          last_attempt: new Date(),
          attempts: delivery.attempts + 1
        });

      this.activeDeliveries++;

      try {
        // Verificar reputação antes da entrega
        const domain = this.extractDomain(delivery.to_address);
        const reputationCheck = await this.reputationManager.checkDeliveryAllowed(domain);

        if (!reputationCheck.allowed) {
          throw new Error(`Delivery not allowed for domain ${domain}: ${reputationCheck.reason}`);
        }

        // Assinar email com DKIM
        const signedEmailData = await this.dkimManager.signEmail({
          from: delivery.from_address,
          to: delivery.to_address,
          subject: delivery.subject,
          body: delivery.body,
          headers: JSON.parse(delivery.headers || '{}')
        });

        // Preparar opções de envio
        const mailOptions: SendMailOptions = {
          from: delivery.from_address,
          to: delivery.to_address,
          subject: delivery.subject,
          text: delivery.body,
          html: delivery.body,
          headers: signedEmailData.headers,
          messageId: delivery.message_id
        };

        // Realizar entrega
        const startTime = Date.now();
        const result = await this.transporter.sendMail(mailOptions);
        const deliveryTime = Date.now() - startTime;

        // Registrar entrega bem-sucedida
        await this.handleSuccessfulDelivery(deliveryId, result, deliveryTime);
        
        // Atualizar reputação
        await this.reputationManager.recordSuccessfulDelivery(domain, 'localhost', deliveryTime);

        logger.info('Email delivered successfully', {
          deliveryId,
          messageId: delivery.message_id,
          to: delivery.to_address,
          deliveryTime
        });

        return {
          success: true,
          messageId: result.messageId,
          deliveryTime
        };

      } catch (error) {
        // Tratar erro de entrega
        await this.handleDeliveryFailure(deliveryId, delivery, error);
        
        // Atualizar reputação negativa
        const domain = this.extractDomain(delivery.to_address);
        await this.reputationManager.recordFailedDelivery(domain, (error as Error).message, 'smtp_error');

        return {
          success: false,
          errorMessage: (error as Error).message
        };
      } finally {
        this.activeDeliveries--;
      }

    } catch (error) {
      logger.error('Error processing delivery', { error, deliveryId });
      return {
        success: false,
        errorMessage: (error as Error).message
      };
    }
  }

  private async handleSuccessfulDelivery(
    deliveryId: number,
    result: any,
    deliveryTime: number
  ): Promise<void> {
    await db('email_delivery_queue')
      .where('id', deliveryId)
      .update({
        status: 'delivered',
        delivered_at: new Date(),
        delivery_time: deliveryTime,
        delivery_report: JSON.stringify(result)
      });

    // Registrar estatística de entrega
    await db('delivery_stats').insert({
      delivery_id: deliveryId,
      status: 'delivered',
      delivery_time: deliveryTime,
      created_at: new Date()
    });
  }

  private async handleDeliveryFailure(
    deliveryId: number,
    delivery: any,
    error: any
  ): Promise<void> {
    const maxAttempts = this.config.retryAttempts;
    const attempts = delivery.attempts + 1;

    if (attempts >= maxAttempts) {
      // Falha permanente
      await db('email_delivery_queue')
        .where('id', deliveryId)
        .update({
          status: 'failed',
          error_message: (error as Error).message,
          next_attempt: null
        });

      logger.warn('Email delivery permanently failed', {
        deliveryId,
        messageId: delivery.message_id,
        attempts,
        error: error.message
      });
    } else {
      // Programar nova tentativa
      const delay = this.calculateRetryDelay(attempts);
      const nextAttempt = new Date(Date.now() + delay);

      await db('email_delivery_queue')
        .where('id', deliveryId)
        .update({
          status: 'pending',
          error_message: (error as Error).message,
          next_attempt: nextAttempt
        });

      // Programar nova tentativa
      this.scheduleRetry(deliveryId, delay);

      logger.info('Email delivery scheduled for retry', {
        deliveryId,
        attempt: attempts,
        nextAttempt,
        delay
      });
    }

    // Registrar estatística de falha
    await db('delivery_stats').insert({
      delivery_id: deliveryId,
      status: 'failed',
      error_message: error.message,
      created_at: new Date()
    });
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelayMs;
    const exponentialDelay = baseDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Adicionar jitter para evitar thundering herd
    const jitter = Math.random() * 0.1 * exponentialDelay;
    
    return Math.min(exponentialDelay + jitter, this.config.maxRetryDelayMs);
  }

  private scheduleRetry(deliveryId: number, delay: number): void {
    const timeout = setTimeout(() => {
      this.deliveryQueue.delete(deliveryId);
      this.processDelivery(deliveryId);
    }, delay);

    this.deliveryQueue.set(deliveryId, timeout);
  }

  private generateMessageId(fromAddress: string): string {
    const domain = this.extractDomain(fromAddress);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `<${timestamp}.${random}@${domain}>`;
  }

  private extractDomain(email: string): string {
    return email.split('@')[1] || 'unknown';
  }

  private calculatePriority(reputationCheck: any, basePriority: number): number {
    let priority = basePriority;
    
    if (reputationCheck.score > 0.8) {
      priority += 10; // Alta prioridade para domínios com boa reputação
    } else if (reputationCheck.score < 0.3) {
      priority -= 10; // Baixa prioridade para domínios com má reputação
    }

    return Math.max(0, Math.min(100, priority));
  }

  private async startDeliveryProcessor(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    setInterval(async () => {
      try {
        if (this.activeDeliveries >= this.config.maxConcurrentDeliveries) {
          return;
        }

        // Buscar próximos emails para entrega
        const pendingDeliveries = await db('email_delivery_queue')
          .where('status', 'pending')
          .where('next_attempt', '<=', new Date())
          .orderBy('priority', 'desc')
          .orderBy('created_at', 'asc')
          .limit(this.config.maxConcurrentDeliveries - this.activeDeliveries)
          .select('id');

        for (const delivery of pendingDeliveries) {
          this.processDelivery(delivery.id);
        }

      } catch (error) {
        logger.error('Error in delivery processor', { error });
      }
    }, 5000); // Verificar a cada 5 segundos

    logger.info('Delivery processor started');
  }

  public async getStats(): Promise<DeliveryQueueStats> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [statusCounts, totalToday, avgDeliveryTime] = await Promise.all([
        db('email_delivery_queue')
          .groupBy('status')
          .count('* as count')
          .select('status'),
        db('email_delivery_queue')
          .where('created_at', '>=', today)
          .count('* as total')
          .first(),
        db('email_delivery_queue')
          .where('status', 'delivered')
          .where('delivered_at', '>=', today)
          .avg('delivery_time as avg_time')
          .first()
      ]);

      const stats: DeliveryQueueStats = {
        pending: 0,
        processing: 0,
        delivered: 0,
        failed: 0,
        bounced: 0,
        deferred: 0,
        totalToday: parseInt(String(totalToday?.total || '0')),
        averageDeliveryTime: parseFloat(avgDeliveryTime?.avg_time || '0')
      };

      statusCounts.forEach(({ status, count }) => {
        if (stats.hasOwnProperty(status)) {
          stats[status] = parseInt(count);
        }
      });

      return stats;

    } catch (error) {
      logger.error('Failed to get delivery stats', { error });
      return {
        pending: 0,
        processing: 0,
        delivered: 0,
        failed: 0,
        bounced: 0,
        deferred: 0,
        totalToday: 0,
        averageDeliveryTime: 0
      };
    }
  }

  public async cancelDelivery(deliveryId: number): Promise<boolean> {
    try {
      const updated = await db('email_delivery_queue')
        .where('id', deliveryId)
        .whereIn('status', ['pending', 'deferred'])
        .update({
          status: 'failed',
          error_message: 'Cancelled by user',
          updated_at: new Date()
        });

      if (updated > 0) {
        // Cancelar timeout se existir
        const timeout = this.deliveryQueue.get(deliveryId);
        if (timeout) {
          clearTimeout(timeout);
          this.deliveryQueue.delete(deliveryId);
        }

        logger.info('Delivery cancelled', { deliveryId });
        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to cancel delivery', { error, deliveryId });
      return false;
    }
  }

  private async createDeliveryTables(): Promise<void> {
    try {
      // Tabela principal de fila de entrega
      const hasDeliveryQueueTable = await db.schema.hasTable('email_delivery_queue');
      if (!hasDeliveryQueueTable) {
        await db.schema.createTable('email_delivery_queue', (table) => {
          table.increments('id').primary();
          table.string('message_id', 255).notNullable().unique();
          table.string('from_address', 255).notNullable();
          table.string('to_address', 255).notNullable();
          table.string('subject', 500);
          table.text('body', 'longtext');
          table.json('headers');
          table.enum('status', ['pending', 'processing', 'delivered', 'failed', 'bounced', 'deferred']).defaultTo('pending');
          table.integer('attempts').defaultTo(0);
          table.timestamp('last_attempt');
          table.timestamp('next_attempt');
          table.timestamp('delivered_at');
          table.integer('delivery_time'); // ms
          table.text('error_message');
          table.integer('priority').defaultTo(50);
          table.integer('user_id').references('id').inTable('users');
          table.integer('campaign_id');
          table.string('bounce_type', 50);
          table.json('delivery_report');
          table.timestamps(true, true);
          
          table.index(['status', 'next_attempt']);
          table.index(['priority', 'created_at']);
          table.index('to_address');
          table.index('user_id');
        });
      }

      // Tabela de estatísticas de entrega
      const hasDeliveryStatsTable = await db.schema.hasTable('delivery_stats');
      if (!hasDeliveryStatsTable) {
        await db.schema.createTable('delivery_stats', (table) => {
          table.increments('id').primary();
          table.integer('delivery_id').references('id').inTable('email_delivery_queue');
          table.string('status', 20).notNullable();
          table.integer('delivery_time');
          table.text('error_message');
          table.timestamps(true, true);
          
          table.index(['status', 'created_at']);
          table.index('delivery_id');
        });
      }

      logger.info('Delivery tables verified/created');
    } catch (error) {
      logger.error('Failed to create delivery tables', { error });
    }
  }

  public async cleanup(): Promise<void> {
    try {
      // Limpar entregas antigas (mais de 30 dias)
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const deleted = await db('email_delivery_queue')
        .where('created_at', '<', cutoffDate)
        .whereIn('status', ['delivered', 'failed'])
        .del();

      if (deleted > 0) {
        logger.info('Cleaned up old delivery records', { deleted });
      }

      // Limpar timeouts orfãos
      this.deliveryQueue.clear();

    } catch (error) {
      logger.error('Delivery cleanup failed', { error });
    }
  }

  public async stop(): Promise<void> {
    this.isProcessing = false;
    
    // Cancelar todos os timeouts pendentes
    for (const timeout of this.deliveryQueue.values()) {
      clearTimeout(timeout);
    }
    this.deliveryQueue.clear();

    // Fechar transporter
    if (this.transporter) {
      this.transporter.close();
    }

    logger.info('Delivery manager stopped');
  }
}