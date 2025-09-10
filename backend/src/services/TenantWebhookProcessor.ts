/**
 * 🔥 TENANT WEBHOOK PROCESSOR - SAAS MULTI-TENANT
 * 
 * Processador de webhooks específico para arquitetura SaaS.
 * Garante isolamento completo entre tenants durante processamento de webhooks.
 */

import { Job } from 'bull';
import { TenantContextService } from './TenantContextService';
import { logger } from '../config/logger';
import db from '../config/database';
import axios from 'axios';

export interface WebhookJobData {
  userId: number;
  webhookId?: string;
  eventType: string;
  url: string;
  payload: Record<string, any>;
  headers?: Record<string, string>;
  retryAttempt?: number;
  maxRetries?: number;
  tenantContext?: {
    userId: number;
    domain: string;
    plan: string;
  };
}

export class TenantWebhookProcessor {
  private tenantContextService: TenantContextService;

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
  }

  /**
   * Processa job de webhook com isolamento completo de tenant
   */
  async processWebhookJob(job: Job<WebhookJobData>): Promise<void> {
    const { userId, webhookId, eventType, url } = job.data;

    try {
      // 🔒 STEP 1: Validar contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(userId);
      if (!tenantContext) {
        throw new Error(`Tenant context não encontrado para usuário ${userId}`);
      }

      logger.info('🔒 Iniciando processamento de webhook para tenant', {
        userId,
        webhookId,
        eventType,
        url,
        plan: tenantContext.plan,
        queueName: job.queue.name
      });

      // 🔒 STEP 2: Validar se o webhook pertence ao tenant
      if (webhookId) {
        const isWebhookValid = await this.validateWebhookOwnership(userId, webhookId);
        if (!isWebhookValid) {
          throw new Error(`Usuário ${userId} não possui webhook ${webhookId}`);
        }
      }

      // 🔒 STEP 3: Aplicar rate limiting por tenant
      const canSend = await this.checkTenantRateLimit(tenantContext);
      if (!canSend) {
        throw new Error(`Rate limit excedido para tenant ${userId}`);
      }

      // 🔒 STEP 4: Processar webhook com isolamento
      await this.processWebhookWithIsolation(job.data, tenantContext);

      // 🔒 STEP 5: Atualizar métricas por tenant
      await this.updateTenantMetrics(userId, 'webhook_sent');

      logger.info('✅ Webhook processado com sucesso para tenant', {
        userId,
        webhookId,
        eventType,
        url
      });

    } catch (error) {
      logger.error('❌ Erro no processamento de webhook para tenant', {
        userId,
        webhookId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });

      // Atualizar métricas de erro por tenant
      await this.updateTenantMetrics(userId, 'webhook_failed');
      
      throw error;
    }
  }

  /**
   * Valida se o webhook pertence ao tenant especificado
   */
  private async validateWebhookOwnership(userId: number, webhookId: string): Promise<boolean> {
    try {
      const webhookRecord = await db('webhooks')
        .where('user_id', userId)
        .where('id', webhookId)
        .where('status', 'active')
        .first();

      return !!webhookRecord;
    } catch (error) {
      logger.error('Erro na validação de propriedade do webhook', {
        userId,
        webhookId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Verifica rate limiting específico do tenant para webhooks
   */
  private async checkTenantRateLimit(tenantContext: any): Promise<boolean> {
    try {
      const validation = await this.tenantContextService.validateTenantOperation(
        tenantContext.userId,
        'send_webhook'
      );

      return validation;
    } catch (error) {
      logger.error('Erro na verificação de rate limit do tenant para webhook', {
        userId: tenantContext.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Processa o webhook com isolamento completo de tenant
   */
  private async processWebhookWithIsolation(
    webhookData: WebhookJobData,
    tenantContext: any
  ): Promise<void> {
    const { userId, webhookId, url, payload, headers = {}, retryAttempt = 0, maxRetries = 3 } = webhookData;

    try {
      // Registrar tentativa de webhook
      if (webhookId) {
        await db('webhook_logs').insert({
          user_id: userId, // 🔒 CRÍTICO: Isolamento por user_id
          webhook_id: webhookId,
          status: 'processing',
          attempt: retryAttempt + 1,
          created_at: new Date()
        });
      }

      // Preparar headers com isolamento de tenant
      const requestHeaders = {
        'Content-Type': 'application/json',
        'X-Tenant-ID': String(userId),
        'X-Webhook-Signature': this.generateWebhookSignature(payload, tenantContext),
        ...headers
      };

      // Fazer requisição HTTP
      const response = await axios.post(url, payload, {
        headers: requestHeaders,
        timeout: 30000,
        validateStatus: (status) => status < 500 // Retry em 5xx
      });

      logger.info('📡 Webhook enviado com sucesso', {
        userId,
        webhookId,
        url,
        status: response.status,
        responseTime: response.headers['x-response-time'] || 'unknown'
      });

      // Registrar sucesso
      if (webhookId) {
        await db('webhook_logs')
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .where('webhook_id', webhookId)
          .where('attempt', retryAttempt + 1)
          .update({
            status: 'sent',
            response_status: response.status,
            response_headers: JSON.stringify(response.headers),
            completed_at: new Date(),
            updated_at: new Date()
          });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ Erro no envio de webhook', {
        userId,
        webhookId,
        url,
        attempt: retryAttempt + 1,
        error: errorMessage
      });

      // Registrar erro
      if (webhookId) {
        await db('webhook_logs')
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .where('webhook_id', webhookId)
          .where('attempt', retryAttempt + 1)
          .update({
            status: 'failed',
            error_message: errorMessage,
            failed_at: new Date(),
            updated_at: new Date()
          });
      }

      // Se ainda há tentativas, reagendar
      if (retryAttempt < maxRetries) {
        logger.info('🔄 Reagendando webhook para nova tentativa', {
          userId,
          webhookId,
          nextAttempt: retryAttempt + 1,
          maxRetries
        });
        
        // Em implementação real, recolocar na fila com delay
        throw new Error(`Webhook failed, will retry. Attempt ${retryAttempt + 1}/${maxRetries}`);
      }
      
      throw error;
    }
  }

  /**
   * Gera assinatura do webhook para validação
   */
  private generateWebhookSignature(payload: Record<string, any>, tenantContext: any): string {
    // Implementação simples - em produção usar HMAC com secret do tenant
    const data = JSON.stringify(payload) + tenantContext.userId;
    return Buffer.from(data).toString('base64').substring(0, 32);
  }

  /**
   * Atualiza métricas específicas do tenant para webhooks
   */
  private async updateTenantMetrics(userId: number, metricType: string): Promise<void> {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      // Buscar ou criar registro de métrica
      const existingMetric = await db('webhook_analytics')
        .where('user_id', userId)
        .where('date', today)
        .first();

      if (existingMetric) {
        // Atualizar métrica existente
        const updateData: Record<string, any> = {};
        
        switch (metricType) {
          case 'webhook_sent':
            updateData.sent_count = db.raw('sent_count + 1');
            break;
          case 'webhook_failed':
            updateData.failed_count = db.raw('failed_count + 1');
            break;
        }

        await db('webhook_analytics')
          .where('id', existingMetric.id)
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .update(updateData);
      } else {
        // Criar nova métrica
        const newMetric: Record<string, any> = {
          user_id: userId,
          date: today,
          sent_count: metricType === 'webhook_sent' ? 1 : 0,
          failed_count: metricType === 'webhook_failed' ? 1 : 0,
          created_at: now,
          updated_at: now
        };

        await db('webhook_analytics').insert(newMetric);
      }

      logger.debug('Métricas de webhook do tenant atualizadas', {
        userId,
        metricType
      });

    } catch (error) {
      logger.error('Erro ao atualizar métricas de webhook do tenant', {
        userId,
        metricType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa múltiplos webhooks para um tenant específico
   */
  async processWebhooksForTenant(userId: number, limit: number = 10): Promise<number> {
    try {
      // Buscar webhooks pendentes APENAS do tenant especificado
      const pendingWebhooks = await db('webhook_queue')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('status', 'pending')
        .whereNull('next_attempt')
        .orWhere('next_attempt', '<=', new Date())
        .orderBy('created_at', 'asc')
        .limit(limit);

      let processedCount = 0;

      for (const webhook of pendingWebhooks) {
        try {
          const jobData: WebhookJobData = {
            userId: webhook.user_id,
            webhookId: webhook.webhook_id,
            eventType: webhook.event_type,
            url: webhook.url,
            payload: JSON.parse(webhook.payload || '{}'),
            headers: JSON.parse(webhook.headers || '{}'),
            retryAttempt: webhook.attempts || 0,
            maxRetries: 3
          };

          // Criar job mock para processamento
          const mockJob = {
            data: jobData,
            queue: { name: `webhook-processing:user:${userId}` }
          } as Job<WebhookJobData>;

          await this.processWebhookJob(mockJob);
          processedCount++;

        } catch (error) {
          logger.error('Erro ao processar webhook individual', {
            webhookId: webhook.id,
            userId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('Processamento de webhooks em lote concluído para tenant', {
        userId,
        processedCount,
        totalPending: pendingWebhooks.length
      });

      return processedCount;

    } catch (error) {
      logger.error('Erro no processamento de webhooks em lote para tenant', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Cria webhook de notificação para evento específico do tenant
   */
  async createWebhookNotification(
    userId: number, 
    eventType: string, 
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      // Buscar webhooks ativos do tenant para este tipo de evento
      const activeWebhooks = await db('webhooks')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('status', 'active')
        .whereRaw("JSON_EXTRACT(events, '$.') LIKE ?", [`%${eventType}%`]);

      for (const webhook of activeWebhooks) {
        // Criar job de webhook na fila
        await db('webhook_queue').insert({
          user_id: userId,
          webhook_id: webhook.id,
          event_type: eventType,
          url: webhook.url,
          payload: JSON.stringify(eventData),
          headers: JSON.stringify(webhook.headers || {}),
          status: 'pending',
          created_at: new Date()
        });

        logger.info('Webhook queued para tenant', {
          userId,
          webhookId: webhook.id,
          eventType,
          url: webhook.url
        });
      }

    } catch (error) {
      logger.error('Erro ao criar notificação webhook', {
        userId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}