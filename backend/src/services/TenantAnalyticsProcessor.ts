/**
 * 🔥 TENANT ANALYTICS PROCESSOR - SAAS MULTI-TENANT
 * 
 * Processador de analytics específico para arquitetura SaaS.
 * Garante isolamento completo entre tenants durante processamento de analytics.
 */

import { Job } from 'bull';
import { TenantContextService } from './TenantContextService';
import { logger } from '../config/logger';
import db from '../config/database';

export interface AnalyticsJobData {
  userId: number;
  eventType: string;
  eventData: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  campaignId?: string;
  emailId?: string;
  tenantContext?: {
    userId: number;
    domain: string;
    plan: string;
  };
}

export class TenantAnalyticsProcessor {
  private tenantContextService: TenantContextService;

  constructor() {
    this.tenantContextService = TenantContextService.getInstance();
  }

  /**
   * Processa job de analytics com isolamento completo de tenant
   */
  async processAnalyticsJob(job: Job<AnalyticsJobData>): Promise<void> {
    const { userId, eventType, eventData } = job.data;

    try {
      // 🔒 STEP 1: Validar contexto do tenant
      const tenantContext = await this.tenantContextService.getTenantContext(userId);
      if (!tenantContext) {
        throw new Error(`Tenant context não encontrado para usuário ${userId}`);
      }

      logger.debug('🔒 Processando analytics para tenant', {
        userId,
        eventType,
        plan: tenantContext.plan,
        queueName: job.queue.name
      });

      // 🔒 STEP 2: Validar se o evento pertence ao tenant
      const isEventValid = await this.validateEventOwnership(job.data, tenantContext);
      if (!isEventValid) {
        throw new Error(`Evento ${eventType} não pertence ao tenant ${userId}`);
      }

      // 🔒 STEP 3: Processar analytics com isolamento
      await this.processAnalyticsWithIsolation(job.data, tenantContext);

      // 🔒 STEP 4: Atualizar métricas agregadas por tenant
      await this.updateAggregatedMetrics(userId, eventType, eventData);

      logger.debug('✅ Analytics processado para tenant', {
        userId,
        eventType
      });

    } catch (error) {
      logger.error('❌ Erro no processamento de analytics para tenant', {
        userId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  /**
   * Valida se o evento de analytics pertence ao tenant
   */
  private async validateEventOwnership(
    analyticsData: AnalyticsJobData, 
    tenantContext: any
  ): Promise<boolean> {
    const { userId, campaignId, emailId } = analyticsData;

    try {
      // Validar campanha se fornecida
      if (campaignId) {
        const campaignRecord = await db('campaigns')
          .where('user_id', userId)
          .where('id', campaignId)
          .first();

        if (!campaignRecord) {
          return false;
        }
      }

      // Validar email se fornecido
      if (emailId) {
        const emailRecord = await db('email_delivery_queue')
          .where('user_id', userId)
          .where('id', emailId)
          .first();

        if (!emailRecord) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Erro na validação de propriedade do evento analytics', {
        userId,
        campaignId,
        emailId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Processa analytics com isolamento completo de tenant
   */
  private async processAnalyticsWithIsolation(
    analyticsData: AnalyticsJobData,
    tenantContext: any
  ): Promise<void> {
    const { userId, eventType, eventData, timestamp, sessionId, ipAddress, userAgent, campaignId, emailId } = analyticsData;

    try {
      // Inserir evento de analytics com isolamento
      const analyticsRecord = {
        user_id: userId, // 🔒 CRÍTICO: Isolamento por user_id
        event_type: eventType,
        event_data: JSON.stringify(eventData),
        timestamp: timestamp || new Date(),
        session_id: sessionId,
        ip_address: ipAddress,
        user_agent: userAgent,
        campaign_id: campaignId,
        email_id: emailId,
        created_at: new Date()
      };

      await db('analytics_events').insert(analyticsRecord);

      // Processar eventos específicos
      switch (eventType) {
        case 'email_opened':
          await this.processEmailOpenEvent(userId, eventData, emailId);
          break;
        case 'email_clicked':
          await this.processEmailClickEvent(userId, eventData, emailId);
          break;
        case 'campaign_conversion':
          await this.processCampaignConversionEvent(userId, eventData, campaignId);
          break;
        case 'user_engagement':
          await this.processUserEngagementEvent(userId, eventData, sessionId);
          break;
      }

      logger.debug('Evento de analytics processado', {
        userId,
        eventType,
        timestamp
      });

    } catch (error) {
      logger.error('Erro no processamento isolado de analytics', {
        userId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Processa evento de abertura de email
   */
  private async processEmailOpenEvent(
    userId: number, 
    eventData: Record<string, any>, 
    emailId?: string
  ): Promise<void> {
    if (!emailId) return;

    try {
      // Atualizar estatísticas do email com isolamento
      await db('email_analytics')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('email_id', emailId)
        .increment('open_count', 1)
        .update({
          first_opened_at: db.raw('COALESCE(first_opened_at, ?)', [new Date()]),
          last_opened_at: new Date(),
          updated_at: new Date()
        });

      // Atualizar métricas diárias
      await this.updateDailyMetrics(userId, 'email_opens', 1);

    } catch (error) {
      logger.error('Erro ao processar evento de abertura de email', {
        userId,
        emailId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa evento de clique em email
   */
  private async processEmailClickEvent(
    userId: number, 
    eventData: Record<string, any>, 
    emailId?: string
  ): Promise<void> {
    if (!emailId) return;

    try {
      const { url } = eventData;

      // Registrar clique específico
      await db('email_clicks').insert({
        user_id: userId, // 🔒 CRÍTICO: Isolamento por user_id
        email_id: emailId,
        url: url,
        clicked_at: new Date(),
        created_at: new Date()
      });

      // Atualizar estatísticas do email
      await db('email_analytics')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('email_id', emailId)
        .increment('click_count', 1)
        .update({
          first_clicked_at: db.raw('COALESCE(first_clicked_at, ?)', [new Date()]),
          last_clicked_at: new Date(),
          updated_at: new Date()
        });

      // Atualizar métricas diárias
      await this.updateDailyMetrics(userId, 'email_clicks', 1);

    } catch (error) {
      logger.error('Erro ao processar evento de clique em email', {
        userId,
        emailId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa evento de conversão de campanha
   */
  private async processCampaignConversionEvent(
    userId: number, 
    eventData: Record<string, any>, 
    campaignId?: string
  ): Promise<void> {
    if (!campaignId) return;

    try {
      const { conversionValue, conversionType } = eventData;

      // Registrar conversão
      await db('campaign_conversions').insert({
        user_id: userId, // 🔒 CRÍTICO: Isolamento por user_id
        campaign_id: campaignId,
        conversion_type: conversionType || 'unknown',
        conversion_value: conversionValue || 0,
        converted_at: new Date(),
        created_at: new Date()
      });

      // Atualizar estatísticas da campanha
      await db('campaign_analytics')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('campaign_id', campaignId)
        .increment('conversion_count', 1)
        .increment('conversion_value', conversionValue || 0)
        .update({
          updated_at: new Date()
        });

      // Atualizar métricas diárias
      await this.updateDailyMetrics(userId, 'campaign_conversions', 1, conversionValue);

    } catch (error) {
      logger.error('Erro ao processar evento de conversão de campanha', {
        userId,
        campaignId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa evento de engajamento do usuário
   */
  private async processUserEngagementEvent(
    userId: number, 
    eventData: Record<string, any>, 
    sessionId?: string
  ): Promise<void> {
    try {
      const { action, duration, page } = eventData;

      // Registrar evento de engajamento
      await db('user_engagement_events').insert({
        user_id: userId, // 🔒 CRÍTICO: Isolamento por user_id
        session_id: sessionId,
        action: action,
        page: page,
        duration: duration,
        event_data: JSON.stringify(eventData),
        created_at: new Date()
      });

      // Atualizar métricas de engajamento
      await this.updateDailyMetrics(userId, 'user_engagement', 1);

    } catch (error) {
      logger.error('Erro ao processar evento de engajamento', {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Atualiza métricas diárias agregadas
   */
  private async updateDailyMetrics(
    userId: number, 
    metricType: string, 
    incrementValue: number = 1,
    monetaryValue: number = 0
  ): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Buscar ou criar registro de métrica diária
      const existingMetric = await db('daily_analytics')
        .where('user_id', userId)
        .where('date', today)
        .first();

      if (existingMetric) {
        // Atualizar métrica existente
        const updateData: Record<string, any> = { updated_at: new Date() };
        
        switch (metricType) {
          case 'email_opens':
            updateData.email_opens = db.raw('email_opens + ?', [incrementValue]);
            break;
          case 'email_clicks':
            updateData.email_clicks = db.raw('email_clicks + ?', [incrementValue]);
            break;
          case 'campaign_conversions':
            updateData.conversions = db.raw('conversions + ?', [incrementValue]);
            updateData.conversion_value = db.raw('conversion_value + ?', [monetaryValue]);
            break;
          case 'user_engagement':
            updateData.engagement_events = db.raw('engagement_events + ?', [incrementValue]);
            break;
        }

        await db('daily_analytics')
          .where('id', existingMetric.id)
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .update(updateData);
      } else {
        // Criar nova métrica
        const newMetric: Record<string, any> = {
          user_id: userId,
          date: today,
          email_opens: metricType === 'email_opens' ? incrementValue : 0,
          email_clicks: metricType === 'email_clicks' ? incrementValue : 0,
          conversions: metricType === 'campaign_conversions' ? incrementValue : 0,
          conversion_value: metricType === 'campaign_conversions' ? monetaryValue : 0,
          engagement_events: metricType === 'user_engagement' ? incrementValue : 0,
          created_at: new Date(),
          updated_at: new Date()
        };

        await db('daily_analytics').insert(newMetric);
      }

    } catch (error) {
      logger.error('Erro ao atualizar métricas diárias', {
        userId,
        metricType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Atualiza métricas agregadas por tenant
   */
  private async updateAggregatedMetrics(
    userId: number,
    eventType: string,
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      // Implementar lógica de agregação específica
      switch (eventType) {
        case 'email_opened':
          await this.updateEmailMetrics(userId, 'open');
          break;
        case 'email_clicked':
          await this.updateEmailMetrics(userId, 'click');
          break;
        case 'email_bounced':
          await this.updateEmailMetrics(userId, 'bounce');
          break;
        case 'email_unsubscribed':
          await this.updateEmailMetrics(userId, 'unsubscribe');
          break;
      }

    } catch (error) {
      logger.error('Erro ao atualizar métricas agregadas', {
        userId,
        eventType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Atualiza métricas específicas de email
   */
  private async updateEmailMetrics(userId: number, metricType: string): Promise<void> {
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Buscar ou criar registro de métrica mensal
      const existingMetric = await db('monthly_email_metrics')
        .where('user_id', userId)
        .where('month', currentMonth)
        .first();

      if (existingMetric) {
        // Atualizar métrica existente
        const updateData: Record<string, any> = { updated_at: now };
        
        switch (metricType) {
          case 'open':
            updateData.total_opens = db.raw('total_opens + 1');
            break;
          case 'click':
            updateData.total_clicks = db.raw('total_clicks + 1');
            break;
          case 'bounce':
            updateData.total_bounces = db.raw('total_bounces + 1');
            break;
          case 'unsubscribe':
            updateData.total_unsubscribes = db.raw('total_unsubscribes + 1');
            break;
        }

        await db('monthly_email_metrics')
          .where('id', existingMetric.id)
          .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
          .update(updateData);
      } else {
        // Criar nova métrica
        const newMetric: Record<string, any> = {
          user_id: userId,
          month: currentMonth,
          total_opens: metricType === 'open' ? 1 : 0,
          total_clicks: metricType === 'click' ? 1 : 0,
          total_bounces: metricType === 'bounce' ? 1 : 0,
          total_unsubscribes: metricType === 'unsubscribe' ? 1 : 0,
          created_at: now,
          updated_at: now
        };

        await db('monthly_email_metrics').insert(newMetric);
      }

    } catch (error) {
      logger.error('Erro ao atualizar métricas de email', {
        userId,
        metricType,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Processa múltiplos eventos de analytics para um tenant específico
   */
  async processAnalyticsForTenant(userId: number, limit: number = 50): Promise<number> {
    try {
      // Buscar eventos pendentes APENAS do tenant especificado
      const pendingEvents = await db('analytics_queue')
        .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
        .where('status', 'pending')
        .orderBy('created_at', 'asc')
        .limit(limit);

      let processedCount = 0;

      for (const event of pendingEvents) {
        try {
          const jobData: AnalyticsJobData = {
            userId: event.user_id,
            eventType: event.event_type,
            eventData: JSON.parse(event.event_data || '{}'),
            timestamp: event.timestamp,
            sessionId: event.session_id,
            ipAddress: event.ip_address,
            userAgent: event.user_agent,
            campaignId: event.campaign_id,
            emailId: event.email_id
          };

          // Criar job mock para processamento
          const mockJob = {
            data: jobData,
            queue: { name: `analytics-processing:user:${userId}` }
          } as Job<AnalyticsJobData>;

          await this.processAnalyticsJob(mockJob);

          // Marcar como processado
          await db('analytics_queue')
            .where('id', event.id)
            .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
            .update({
              status: 'processed',
              processed_at: new Date(),
              updated_at: new Date()
            });

          processedCount++;

        } catch (error) {
          logger.error('Erro ao processar evento de analytics individual', {
            eventId: event.id,
            userId,
            error: error instanceof Error ? error.message : String(error)
          });

          // Marcar como com erro
          await db('analytics_queue')
            .where('id', event.id)
            .where('user_id', userId) // 🔒 CRÍTICO: Isolamento por user_id
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : String(error),
              updated_at: new Date()
            });
        }
      }

      logger.info('Processamento de analytics em lote concluído para tenant', {
        userId,
        processedCount,
        totalPending: pendingEvents.length
      });

      return processedCount;

    } catch (error) {
      logger.error('Erro no processamento de analytics em lote para tenant', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }
}