import axios from 'axios';
import { logger } from '../config/logger';
import { createWebhookSignature } from '../utils/crypto';
import db from '../config/database';

interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  webhook_id: string;
}

class WebhookService {
  async sendWebhook(event: string, payload: any, webhookId?: number): Promise<void> {
    try {
      let webhooks;

      if (webhookId) {
        // Send to specific webhook
        webhooks = await db('webhooks')
          .where('id', webhookId)
          .where('is_active', true);
      } else {
        // Find all active webhooks that listen to this event
        webhooks = await db('webhooks')
          .where('is_active', true)
          .whereRaw("JSON_EXTRACT(events, '$') LIKE ?", [`%"${event}"%`]);
      }

      if (!webhooks.length) {
        logger.debug('No active webhooks found for event', { event });
        return;
      }

      // Send webhook to each endpoint
      const webhookPromises = webhooks.map(webhook => 
        this.deliverWebhook(webhook, event, payload)
      );

      await Promise.allSettled(webhookPromises);
      
    } catch (error) {
      logger.error('Failed to process webhooks', { error, event });
    }
  }

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
            'User-Agent': 'UrbanSend-Webhook/1.0'
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
      // Create a webhook_logs table if it doesn't exist
      const logExists = await db.schema.hasTable('webhook_logs');
      
      if (!logExists) {
        await db.schema.createTable('webhook_logs', (table) => {
          table.increments('id').primary();
          table.integer('webhook_id').unsigned().notNullable();
          table.string('event').notNullable();
          table.text('payload');
          table.boolean('success').notNullable();
          table.integer('status_code').nullable();
          table.text('response_body').nullable();
          table.integer('attempt').notNullable();
          table.text('error_message').nullable();
          table.datetime('created_at').defaultTo(db.fn.now());
          
          table.foreign('webhook_id').references('id').inTable('webhooks').onDelete('CASCADE');
          table.index(['webhook_id', 'created_at']);
          table.index(['event']);
        });
      }

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

  async getWebhookLogs(webhookId: number, limit: number = 50): Promise<any[]> {
    try {
      const logs = await db('webhook_logs')
        .where('webhook_id', webhookId)
        .orderBy('created_at', 'desc')
        .limit(limit);

      return logs;
    } catch (error) {
      logger.error('Failed to get webhook logs', { error, webhookId });
      return [];
    }
  }

  async testWebhook(webhookId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const webhook = await db('webhooks')
        .where('id', webhookId)
        .first();

      if (!webhook) {
        return { success: false, error: 'Webhook not found' };
      }

      // Send test payload
      const testPayload = {
        event: 'webhook.test',
        data: {
          message: 'This is a test webhook from UrbanSend',
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString(),
        webhook_id: webhookId.toString()
      };

      await this.deliverWebhook(webhook, 'webhook.test', testPayload.data);

      return { success: true };
    } catch (error) {
      logger.error('Webhook test failed', { error, webhookId });
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

  async getWebhookStats(webhookId: number, days: number = 7): Promise<any> {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      const hasLogsTable = await db.schema.hasTable('webhook_logs');
      if (!hasLogsTable) {
        return {
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
        .where('created_at', '>=', sinceDate)
        .first();

      const eventStats = await db('webhook_logs')
        .select('event')
        .count('* as count')
        .sum(db.raw('CASE WHEN success = 1 THEN 1 ELSE 0 END as successful'))
        .where('webhook_id', webhookId)
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
        total_attempts: totalAttempts,
        successful_deliveries: successfulDeliveries,
        failed_deliveries: Number(statsData?.failed_deliveries) || 0,
        success_rate: parseFloat(successRate),
        events
      };
    } catch (error) {
      logger.error('Failed to get webhook stats', { error, webhookId });
      return null;
    }
  }
}

export const webhookService = new WebhookService();
export default webhookService;