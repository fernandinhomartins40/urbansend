import axios from 'axios';
import { logger } from '../config/logger';
import { createWebhookSignature } from '../utils/crypto';
import db from '../config/database';
// WebhookJobData movido para interface local na arquitetura simplificada
interface WebhookJobData {
  webhookUrl: string;
  eventType: string;
  payload: any;
  secret?: string;
  userId: number;
  url: string; // alias para webhookUrl
  method?: string;
  headers?: Record<string, string>;
  entityId?: string;
  retryCount?: number;
}
import { TenantContextService } from './TenantContextService';
import { sqlJsonContainsLike } from '../utils/sqlDialect';

interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  webhook_id: string;
  tenant_id?: number; // 🔥 NOVO: Identificador do tenant
}

// 🔥 NOVA INTERFACE: Stats por tenant
interface TenantWebhookStats {
  tenantId: number;
  total_attempts: number;
  successful_deliveries: number;
  failed_deliveries: number;
  success_rate: number;
  events: Record<string, any>;
}

export class WebhookService {
  private tenantContextService: TenantContextService; // 🔥 NOVO: Tenant context service

  constructor() {
    this.tenantContextService = new TenantContextService(); // 🔥 NOVO: Inicializar tenant context
    this.validateRequiredTables();
  }

  private async validateRequiredTables() {
    try {
      const requiredTables = [
        'webhook_logs',
        'webhook_job_logs'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('WebhookService: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do WebhookService:', error);
      throw error;
    }
  }

  // 🔥 MÉTODO MODIFICADO: Enviar webhook com validação de tenant
  async sendWebhook(event: string, payload: any, tenantId: number, webhookId?: number): Promise<void> {
    try {
      // 🔥 CRÍTICO: Validar contexto do tenant primeiro
      if (!tenantId) {
        throw new Error('Missing tenant ID for webhook sending');
      }

      const tenantContext = await this.tenantContextService.getTenantContext(tenantId);
      if (!tenantContext.isActive) {
        logger.warn(`Skipping webhook for inactive tenant ${tenantId}`, { event });
        return;
      }

      let webhooks;

      if (webhookId) {
        // 🔥 CRÍTICO: Send to specific webhook COM validação de tenant
        webhooks = await db('webhooks')
          .where('id', webhookId)
          .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
          .where('is_active', true);
      } else {
        // 🔥 CRÍTICO: Find webhooks SOMENTE deste tenant
        webhooks = await db('webhooks')
          .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
          .where('is_active', true)
          .whereRaw(sqlJsonContainsLike('events'), [`%"${event}"%`]);
      }

      if (!webhooks.length) {
        logger.debug('No active webhooks found for tenant and event', { 
          tenantId, 
          event,
          webhookId 
        });
        return;
      }

      logger.info(`Sending webhooks for tenant ${tenantId}`, {
        tenantId,
        event,
        webhookCount: webhooks.length
      });

      // Send webhook to each endpoint with tenant context
      const webhookPromises = webhooks.map(webhook => 
        this.deliverWebhookWithTenant(webhook, event, payload, tenantId)
      );

      await Promise.allSettled(webhookPromises);
      
    } catch (error) {
      logger.error('Failed to process tenant webhooks', { 
        error, 
        event, 
        tenantId,
        webhookId 
      });
    }
  }

  // 🔥 NOVO MÉTODO: Deliver webhook com tenant context
  private async deliverWebhookWithTenant(webhook: any, event: string, data: any, tenantId: number): Promise<void> {
    const webhookPayload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      webhook_id: webhook.id.toString(),
      tenant_id: tenantId // 🔥 NOVO: Incluir tenant ID no payload
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = createWebhookSignature(payloadString, webhook.secret);

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await axios.post(webhook.url, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': event,
            'X-Webhook-ID': webhook.id.toString(),
            'X-Tenant-ID': tenantId.toString(), // 🔥 NOVO: Header com tenant ID
            'User-Agent': 'UltraZend-Webhook/1.0'
          },
          timeout: 30000,
          validateStatus: (status) => status >= 200 && status < 300
        });

        // Log successful delivery com tenant ID
        await this.logWebhookAttemptWithTenant(webhook.id, event, payloadString, tenantId, {
          success: true,
          status_code: response.status,
          response_body: JSON.stringify(response.data).substring(0, 1000),
          attempt: attempt + 1
        });

        logger.info('Webhook delivered successfully for tenant', {
          tenantId,
          webhookId: webhook.id,
          event,
          url: webhook.url,
          status: response.status
        });

        return; // Success, exit retry loop

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= maxRetries;
        
        let errorInfo: any = {
          success: false,
          attempt,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        };

        if (axios.isAxiosError(error)) {
          errorInfo.status_code = error.response?.status;
          errorInfo.response_body = error.response?.data ? 
            JSON.stringify(error.response.data).substring(0, 1000) : null;
        }

        // Log failed attempt com tenant ID
        await this.logWebhookAttemptWithTenant(webhook.id, event, payloadString, tenantId, errorInfo);

        if (isLastAttempt) {
          logger.error('Webhook delivery failed after all retries for tenant', {
            tenantId,
            webhookId: webhook.id,
            event,
            url: webhook.url,
            attempts: maxRetries,
            error: errorInfo
          });
        } else {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          logger.warn('Webhook delivery failed, retrying for tenant', {
            tenantId,
            webhookId: webhook.id,
            event,
            url: webhook.url,
            attempt,
            nextRetryIn: delay
          });
        }
      }
    }
  }

  // 🔥 MÉTODO MANTIDO: Deliver webhook sem tenant (para compatibilidade)
  private async deliverWebhook(webhook: any, event: string, data: any): Promise<void> {
    const webhookPayload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      webhook_id: webhook.id.toString()
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = createWebhookSignature(payloadString, webhook.secret);

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await axios.post(webhook.url, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': event,
            'X-Webhook-ID': webhook.id.toString(),
            'User-Agent': 'UltraZend-Webhook/1.0'
          },
          timeout: 30000, // 30 seconds timeout
          validateStatus: (status) => status >= 200 && status < 300
        });

        // Log successful delivery
        await this.logWebhookAttempt(webhook.id, event, payloadString, {
          success: true,
          status_code: response.status,
          response_body: JSON.stringify(response.data).substring(0, 1000),
          attempt: attempt + 1
        });

        logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          event,
          url: webhook.url,
          status: response.status
        });

        return; // Success, exit retry loop

      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= maxRetries;
        
        let errorInfo: any = {
          success: false,
          attempt,
          error_message: error instanceof Error ? error.message : 'Unknown error'
        };

        if (axios.isAxiosError(error)) {
          errorInfo.status_code = error.response?.status;
          errorInfo.response_body = error.response?.data ? 
            JSON.stringify(error.response.data).substring(0, 1000) : null;
        }

        // Log failed attempt
        await this.logWebhookAttempt(webhook.id, event, payloadString, errorInfo);

        if (isLastAttempt) {
          logger.error('Webhook delivery failed after all retries', {
            webhookId: webhook.id,
            event,
            url: webhook.url,
            attempts: maxRetries,
            error: errorInfo
          });
        } else {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          logger.warn('Webhook delivery failed, retrying', {
            webhookId: webhook.id,
            event,
            url: webhook.url,
            attempt,
            nextRetryIn: delay
          });
        }
      }
    }
  }

  // 🔥 NOVO MÉTODO: Log webhook attempt com tenant ID
  private async logWebhookAttemptWithTenant(
    webhookId: number,
    event: string,
    payload: string,
    tenantId: number,
    result: {
      success: boolean;
      status_code?: number;
      response_body?: string;
      attempt: number;
      error_message?: string;
    }
  ): Promise<void> {
    try {
      await db('webhook_logs').insert({
        webhook_id: webhookId,
        event,
        payload: payload.substring(0, 10000), // Limit payload size in logs
        success: result.success,
        status_code: result.status_code,
        response_body: result.response_body,
        attempt: result.attempt,
        error_message: result.error_message,
        tenant_id: tenantId, // 🔥 NOVO: Registrar tenant ID
        created_at: new Date()
      });

    } catch (error) {
      logger.error('Failed to log webhook attempt for tenant', { 
        error, 
        webhookId, 
        event,
        tenantId 
      });
    }
  }

  // 🔥 MÉTODO MANTIDO: Log webhook attempt sem tenant (para compatibilidade)
  private async logWebhookAttempt(
    webhookId: number,
    event: string,
    payload: string,
    result: {
      success: boolean;
      status_code?: number;
      response_body?: string;
      attempt: number;
      error_message?: string;
    }
  ): Promise<void> {
    try {
      await db('webhook_logs').insert({
        webhook_id: webhookId,
        event,
        payload: payload.substring(0, 10000), // Limit payload size in logs
        success: result.success,
        status_code: result.status_code,
        response_body: result.response_body,
        attempt: result.attempt,
        error_message: result.error_message,
        created_at: new Date()
      });

    } catch (error) {
      logger.error('Failed to log webhook attempt', { error, webhookId, event });
    }
  }

  // 🔥 MÉTODO MODIFICADO: Get webhook logs com validação de tenant
  async getWebhookLogs(webhookId: number, tenantId: number, limit: number = 50): Promise<any[]> {
    try {
      // 🔥 CRÍTICO: Validar que webhook pertence ao tenant
      const webhook = await db('webhooks')
        .where('id', webhookId)
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .first();

      if (!webhook) {
        logger.warn(`Webhook ${webhookId} not found for tenant ${tenantId}`);
        return [];
      }

      const logs = await db('webhook_logs')
        .where('webhook_id', webhookId)
        .where('tenant_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .orderBy('created_at', 'desc')
        .limit(limit);

      return logs;
    } catch (error) {
      logger.error('Failed to get webhook logs for tenant', { 
        error, 
        webhookId,
        tenantId 
      });
      return [];
    }
  }

  // 🔥 MÉTODO MODIFICADO: Test webhook com validação de tenant
  async testWebhook(webhookId: number, tenantId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 CRÍTICO: Validar que webhook pertence ao tenant
      const webhook = await db('webhooks')
        .where('id', webhookId)
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .first();

      if (!webhook) {
        return { 
          success: false, 
          error: `Webhook ${webhookId} not found for tenant ${tenantId}` 
        };
      }

      // Send test payload with tenant context
      const testPayload = {
        message: 'This is a test webhook from UltraZend',
        timestamp: new Date().toISOString(),
        tenant_id: tenantId
      };

      await this.deliverWebhookWithTenant(webhook, 'webhook.test', testPayload, tenantId);

      logger.info('Webhook test completed for tenant', { 
        webhookId, 
        tenantId,
        url: webhook.url 
      });

      return { success: true };
    } catch (error) {
      logger.error('Webhook test failed for tenant', { 
        error, 
        webhookId,
        tenantId 
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async cleanupOldLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const hasLogsTable = await db.schema.hasTable('webhook_logs');
      if (!hasLogsTable) {
        return;
      }

      const deletedCount = await db('webhook_logs')
        .where('created_at', '<', cutoffDate)
        .del();

      logger.info('Cleaned up old webhook logs', { deletedCount, daysToKeep });
    } catch (error) {
      logger.error('Failed to cleanup webhook logs', { error });
    }
  }

  // 🔥 MÉTODO MODIFICADO: Get webhook stats com validação de tenant
  async getWebhookStats(webhookId: number, tenantId: number, days: number = 7): Promise<TenantWebhookStats | null> {
    try {
      // 🔥 CRÍTICO: Validar que webhook pertence ao tenant
      const webhook = await db('webhooks')
        .where('id', webhookId)
        .where('user_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .first();

      if (!webhook) {
        logger.warn(`Webhook ${webhookId} not found for tenant ${tenantId}`);
        return null;
      }

      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const hasLogsTable = await db.schema.hasTable('webhook_logs');
      if (!hasLogsTable) {
        return {
          tenantId,
          total_attempts: 0,
          successful_deliveries: 0,
          failed_deliveries: 0,
          success_rate: 0,
          events: {}
        };
      }

      const stats = await db('webhook_logs')
        .select(
          db.raw('COUNT(*) as total_attempts'),
          db.raw('SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_deliveries'),
          db.raw('SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_deliveries')
        )
        .where('webhook_id', webhookId)
        .where('tenant_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .where('created_at', '>=', sinceDate)
        .first();

      const eventStats = await db('webhook_logs')
        .select('event')
        .count('* as count')
        .sum(db.raw('CASE WHEN success = 1 THEN 1 ELSE 0 END as successful'))
        .where('webhook_id', webhookId)
        .where('tenant_id', tenantId) // 🔒 ISOLAMENTO POR TENANT!
        .where('created_at', '>=', sinceDate)
        .groupBy('event');

      const events = eventStats.reduce((acc: any, stat: any) => {
        acc[stat.event] = {
          total: stat.count,
          successful: stat.successful,
          failed: stat.count - stat.successful
        };
        return acc;
      }, {});

      const statsData = stats as any;
      const totalAttempts = Number(statsData?.total_attempts) || 0;
      const successfulDeliveries = Number(statsData?.successful_deliveries) || 0;
      
      const successRate = totalAttempts > 0 
        ? (successfulDeliveries / totalAttempts * 100).toFixed(2)
        : '0';

      return {
        tenantId,
        total_attempts: totalAttempts,
        successful_deliveries: successfulDeliveries,
        failed_deliveries: Number(statsData?.failed_deliveries) || 0,
        success_rate: parseFloat(successRate),
        events
      };
    } catch (error) {
      logger.error('Failed to get webhook stats for tenant', { 
        error, 
        webhookId,
        tenantId 
      });
      return null;
    }
  }

  // Novos métodos para processamento de jobs da fila
  async processWebhookJob(jobData: WebhookJobData): Promise<any> {
    try {
      logger.info('Processing webhook job', {
        url: jobData.url,
        eventType: jobData.eventType,
        entityId: jobData.entityId
      });

      const response = await axios({
        method: jobData.method,
        url: jobData.url,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'UltraZend-Webhook/1.0',
          'X-Webhook-Event': jobData.eventType,
          'X-Entity-ID': jobData.entityId.toString(),
          ...jobData.headers
        },
        data: jobData.payload,
        timeout: 30000,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // Registrar webhook bem-sucedido
      await this.logWebhookDelivery(jobData, {
        success: true,
        statusCode: response.status,
        responseBody: JSON.stringify(response.data).substring(0, 1000),
        deliveredAt: new Date()
      });

      logger.info('Webhook job completed successfully', {
        url: jobData.url,
        statusCode: response.status
      });

      return {
        success: true,
        statusCode: response.status,
        response: response.data
      };

    } catch (error) {
      // Registrar webhook falhado
      const errorData = {
        success: false,
        statusCode: axios.isAxiosError(error) ? error.response?.status : null,
        errorMessage: (error as Error).message,
        deliveredAt: new Date()
      };

      await this.logWebhookDelivery(jobData, errorData);

      logger.error('Webhook job failed', {
        url: jobData.url,
        error: (error as Error).message,
        statusCode: errorData.statusCode
      });

      throw error;
    }
  }

  async processDeliveryNotification(jobData: WebhookJobData): Promise<any> {
    try {
      logger.info('Processing delivery notification webhook', {
        url: jobData.url,
        entityId: jobData.entityId
      });

      // Buscar dados do email para notificação
      const emailId = jobData.entityId ? parseInt(jobData.entityId, 10) : 0;
      const emailData = await this.getEmailDeliveryData(emailId);
      if (!emailData) {
        throw new Error(`Email ${jobData.entityId} not found for delivery notification`);
      }

      const notificationPayload = {
        event: 'email.delivered',
        email_id: jobData.entityId,
        message_id: emailData.message_id,
        to: emailData.to_email,
        subject: emailData.subject,
        status: emailData.status,
        delivered_at: emailData.delivered_at || new Date().toISOString(),
        metadata: emailData.metadata ? JSON.parse(emailData.metadata) : {}
      };

      const response = await axios.post(jobData.url, notificationPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'UltraZend-Webhook/1.0',
          'X-Webhook-Event': 'email.delivered',
          'X-Email-ID': jobData.entityId.toString(),
          ...jobData.headers
        },
        timeout: 30000,
        validateStatus: (status) => status >= 200 && status < 400
      });

      // Registrar notificação bem-sucedida
      await this.logWebhookDelivery(jobData, {
        success: true,
        statusCode: response.status,
        responseBody: JSON.stringify(response.data).substring(0, 1000),
        deliveredAt: new Date()
      });

      return {
        success: true,
        statusCode: response.status,
        notificationSent: true
      };

    } catch (error) {
      await this.logWebhookDelivery(jobData, {
        success: false,
        statusCode: axios.isAxiosError(error) ? error.response?.status : null,
        errorMessage: (error as Error).message,
        deliveredAt: new Date()
      });

      logger.error('Delivery notification webhook failed', {
        url: jobData.url,
        entityId: jobData.entityId,
        error: (error as Error).message
      });

      throw error;
    }
  }

  private async getEmailDeliveryData(emailId: number): Promise<any> {
    try {
      const email = await db('emails')
        .where('id', emailId)
        .select('id', 'message_id', 'to_email', 'subject', 'status', 'delivered_at', 'metadata')
        .first();

      return email;
    } catch (error) {
      logger.error('Failed to get email delivery data', { error, emailId });
      return null;
    }
  }

  private async logWebhookDelivery(jobData: WebhookJobData, result: any): Promise<void> {
    try {
      await db('webhook_job_logs').insert({
        url: jobData.url,
        method: jobData.method,
        event_type: jobData.eventType,
        entity_id: jobData.entityId,
        user_id: jobData.userId,
        payload: JSON.stringify(jobData.payload),
        headers: JSON.stringify(jobData.headers || {}),
        success: result.success,
        status_code: result.statusCode,
        response_body: result.responseBody,
        error_message: result.errorMessage,
        delivered_at: result.deliveredAt,
        created_at: new Date()
      });

    } catch (error) {
      logger.error('Failed to log webhook delivery', { error, jobData });
    }
  }

  async getWebhookJobStats(userId?: number, days: number = 7): Promise<any> {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const hasWebhookJobLogsTable = await db.schema.hasTable('webhook_job_logs');
      if (!hasWebhookJobLogsTable) {
        return {
          total_attempts: 0,
          successful_deliveries: 0,
          failed_deliveries: 0,
          success_rate: 0,
          events: {}
        };
      }

      let query = db('webhook_job_logs')
        .where('delivered_at', '>=', sinceDate);

      if (userId) {
        query = query.where('user_id', userId);
      }

      const stats = await query
        .select(
          db.raw('COUNT(*) as total_attempts'),
          db.raw('SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_deliveries'),
          db.raw('SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_deliveries')
        )
        .first();

      const eventStats = await query.clone()
        .select('event_type')
        .count('* as count')
        .sum(db.raw('CASE WHEN success = 1 THEN 1 ELSE 0 END as successful'))
        .groupBy('event_type');

      const events = eventStats.reduce((acc: any, stat: any) => {
        acc[stat.event_type] = {
          total: stat.count,
          successful: stat.successful,
          failed: stat.count - stat.successful
        };
        return acc;
      }, {});

      const statsData = stats as any;
      const totalAttempts = Number(statsData?.total_attempts) || 0;
      const successfulDeliveries = Number(statsData?.successful_deliveries) || 0;
      
      const successRate = totalAttempts > 0 
        ? (successfulDeliveries / totalAttempts * 100).toFixed(2)
        : '0';

      return {
        total_attempts: totalAttempts,
        successful_deliveries: successfulDeliveries,
        failed_deliveries: Number(statsData?.failed_deliveries) || 0,
        success_rate: parseFloat(successRate),
        events
      };

    } catch (error) {
      logger.error('Failed to get webhook job stats', { error, userId });
      return null;
    }
  }

  async retryFailedWebhooks(hours: number = 24): Promise<number> {
    try {
      const sinceDate = new Date();
      sinceDate.setHours(sinceDate.getHours() - hours);

      const hasWebhookJobLogsTable = await db.schema.hasTable('webhook_job_logs');
      if (!hasWebhookJobLogsTable) {
        return 0;
      }

      // Buscar webhooks falhados nas últimas X horas
      const failedWebhooks = await db('webhook_job_logs')
        .where('success', false)
        .where('delivered_at', '>=', sinceDate)
        .where('status_code', '!=', 404) // Não retry 404s
        .select('*');

      let retriedCount = 0;

      for (const webhook of failedWebhooks) {
        try {
          const jobData: WebhookJobData = {
            webhookUrl: webhook.url,
            url: webhook.url,
            method: webhook.method,
            eventType: webhook.event_type,
            entityId: webhook.entity_id,
            userId: webhook.user_id,
            payload: JSON.parse(webhook.payload || '{}'),
            headers: JSON.parse(webhook.headers || '{}'),
            retryCount: (webhook.retry_count || 0) + 1
          };

          // Tentar reenviar
          await this.processWebhookJob(jobData);
          retriedCount++;

        } catch (error) {
          logger.warn('Retry webhook failed again', {
            webhookId: webhook.id,
            url: webhook.url,
            error: (error as Error).message
          });
        }
      }

      logger.info('Webhook retry process completed', {
        totalFailed: failedWebhooks.length,
        retriedSuccessfully: retriedCount
      });

      return retriedCount;

    } catch (error) {
      logger.error('Failed to retry failed webhooks', { error });
      return 0;
    }
  }

  async cleanupWebhookJobLogs(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const hasWebhookJobLogsTable = await db.schema.hasTable('webhook_job_logs');
      if (!hasWebhookJobLogsTable) {
        return;
      }

      const deletedCount = await db('webhook_job_logs')
        .where('delivered_at', '<', cutoffDate)
        .del();

      logger.info('Cleaned up old webhook job logs', { deletedCount, daysToKeep });
    } catch (error) {
      logger.error('Failed to cleanup webhook job logs', { error });
    }
  }
}

export const webhookService = new WebhookService();
export default webhookService;