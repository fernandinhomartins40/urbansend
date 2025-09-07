const db = require('../config/database');
const { CampaignService } = require('./CampaignService');
const { logger } = require('../config/logger');

/**
 * SPRINT 2 - Campaign Scheduler Service
 * Serviço responsável pelo agendamento automático de campanhas
 * Verifica campanhas agendadas e executa no momento apropriado
 */
class CampaignScheduler {
  constructor() {
    this.intervalId = null;
    this.campaignService = new CampaignService();
    this.isProcessing = false;
    this.checkInterval = 60000; // 1 minuto
  }

  /**
   * Inicializar o scheduler
   */
  start() {
    if (this.intervalId) {
      logger.warn('CampaignScheduler: Scheduler já está rodando');
      return;
    }

    logger.info('CampaignScheduler: Iniciando scheduler automático', {
      checkInterval: this.checkInterval
    });

    // Processar imediatamente na inicialização
    this.processScheduledCampaigns();

    // Configurar intervalo de verificação
    this.intervalId = setInterval(() => {
      this.processScheduledCampaigns();
    }, this.checkInterval);

    logger.info('CampaignScheduler: Scheduler iniciado com sucesso');
  }

  /**
   * Parar o scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('CampaignScheduler: Scheduler parado');
    }
  }

  /**
   * Processar campanhas agendadas
   */
  async processScheduledCampaigns() {
    if (this.isProcessing) {
      return; // Evita processamento concorrente
    }

    this.isProcessing = true;
    
    try {
      const now = new Date();
      
      // Buscar campanhas agendadas para execução
      const scheduledCampaigns = await db('campaigns')
        .where('status', 'scheduled')
        .where('scheduled_at', '<=', now)
        .orderBy('scheduled_at', 'asc');

      if (scheduledCampaigns.length === 0) {
        return;
      }

      logger.info('CampaignScheduler: Encontradas campanhas para processamento', {
        count: scheduledCampaigns.length
      });

      // Processar cada campanha
      for (const campaign of scheduledCampaigns) {
        try {
          await this.processSingleCampaign(campaign);
        } catch (error) {
          logger.error('CampaignScheduler: Erro ao processar campanha individual', {
            campaignId: campaign.id,
            campaignName: campaign.name,
            error: error.message,
            stack: error.stack
          });
        }
      }

    } catch (error) {
      logger.error('CampaignScheduler: Erro no processamento de campanhas agendadas', {
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Processar uma campanha individual
   */
  async processSingleCampaign(campaign) {
    logger.info('CampaignScheduler: Processando campanha agendada', {
      campaignId: campaign.id,
      campaignName: campaign.name,
      scheduledAt: campaign.scheduled_at
    });

    try {
      // Validações básicas antes do envio
      const validationResult = await this.validateCampaignForExecution(campaign);
      
      if (!validationResult.valid) {
        logger.error('CampaignScheduler: Campanha inválida para execução', {
          campaignId: campaign.id,
          errors: validationResult.errors
        });

        // Marcar campanha como falhou
        await this.markCampaignAsFailed(campaign.id, validationResult.errors);
        return;
      }

      // Enviar campanha usando o CampaignService
      await this.campaignService.sendCampaign(campaign.user_id, campaign.id);
      
      logger.info('CampaignScheduler: Campanha enviada com sucesso', {
        campaignId: campaign.id,
        campaignName: campaign.name
      });

      // Registrar evento de agendamento executado
      await this.logSchedulingEvent(campaign.id, 'executed', 'Campanha executada automaticamente pelo scheduler');

    } catch (error) {
      logger.error('CampaignScheduler: Erro ao enviar campanha agendada', {
        campaignId: campaign.id,
        campaignName: campaign.name,
        error: error.message
      });

      // Marcar campanha como falhou
      await this.markCampaignAsFailed(campaign.id, [error.message]);

      // Registrar evento de falha
      await this.logSchedulingEvent(campaign.id, 'failed', error.message);
    }
  }

  /**
   * Validar campanha antes da execução
   */
  async validateCampaignForExecution(campaign) {
    const errors = [];

    // Verificar se tem template ou subject
    if (!campaign.template_id && !campaign.subject_line) {
      errors.push('Campanha deve ter template ou linha de assunto definida');
    }

    // Verificar se tem destinatários
    const recipientCount = await db('campaign_recipients')
      .where('campaign_id', campaign.id)
      .count('* as count')
      .first();

    if (!recipientCount || recipientCount.count === 0) {
      errors.push('Campanha deve ter pelo menos um destinatário');
    }

    // Verificar se usuário ainda existe e está ativo
    const user = await db('users')
      .where('id', campaign.user_id)
      .where('is_active', true)
      .first();

    if (!user) {
      errors.push('Usuário da campanha não está ativo ou foi removido');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Marcar campanha como falhou
   */
  async markCampaignAsFailed(campaignId, errors) {
    await db('campaigns')
      .where('id', campaignId)
      .update({
        status: 'cancelled',
        updated_at: new Date()
      });

    // Registrar detalhes da falha
    await db('campaign_executions').insert({
      campaign_id: campaignId,
      user_id: 0, // Sistema
      started_at: new Date(),
      completed_at: new Date(),
      status: 'failed',
      error_message: errors.join('; '),
      execution_log: JSON.stringify({
        type: 'scheduler_validation_failed',
        errors: errors,
        timestamp: new Date().toISOString()
      }),
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  /**
   * Registrar evento de agendamento
   */
  async logSchedulingEvent(campaignId, eventType, message) {
    try {
      await db('campaign_scheduling_log').insert({
        campaign_id: campaignId,
        event_type: eventType,
        message: message,
        processed_at: new Date(),
        created_at: new Date()
      });
    } catch (error) {
      // Se a tabela não existir, apenas log o aviso
      logger.warn('CampaignScheduler: Não foi possível registrar evento (tabela de log pode não existir)', {
        campaignId: campaignId,
        eventType: eventType,
        error: error.message
      });
    }
  }

  /**
   * Obter estatísticas do scheduler
   */
  async getSchedulerStats() {
    const stats = {};

    // Campanhas agendadas pendentes
    const pendingCount = await db('campaigns')
      .where('status', 'scheduled')
      .count('* as count')
      .first();
    
    stats.pendingScheduledCampaigns = pendingCount.count || 0;

    // Campanhas agendadas para próximas 24h
    const next24h = new Date();
    next24h.setHours(next24h.getHours() + 24);
    
    const upcomingCount = await db('campaigns')
      .where('status', 'scheduled')
      .where('scheduled_at', '<=', next24h)
      .count('* as count')
      .first();
    
    stats.upcomingIn24h = upcomingCount.count || 0;

    // Campanhas vencidas (agendadas no passado mas não executadas)
    const overdueCampaigns = await db('campaigns')
      .where('status', 'scheduled')
      .where('scheduled_at', '<', new Date())
      .count('* as count')
      .first();
    
    stats.overdueCampaigns = overdueCampaigns.count || 0;

    // Status do scheduler
    stats.schedulerRunning = this.intervalId !== null;
    stats.isProcessing = this.isProcessing;
    stats.checkInterval = this.checkInterval;

    return stats;
  }

  /**
   * Reagendar campanha
   */
  async rescheduleCampaign(campaignId, newScheduleTime) {
    const campaign = await db('campaigns')
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    if (campaign.status !== 'scheduled') {
      throw new Error('Apenas campanhas agendadas podem ser reagendadas');
    }

    const scheduleDate = new Date(newScheduleTime);
    const now = new Date();

    if (scheduleDate <= now) {
      throw new Error('Nova data de agendamento deve ser no futuro');
    }

    await db('campaigns')
      .where('id', campaignId)
      .update({
        scheduled_at: scheduleDate,
        updated_at: new Date()
      });

    await this.logSchedulingEvent(campaignId, 'rescheduled', 
      `Campanha reagendada para ${scheduleDate.toISOString()}`);

    logger.info('CampaignScheduler: Campanha reagendada', {
      campaignId: campaignId,
      newScheduleTime: scheduleDate.toISOString()
    });

    return { success: true, newScheduleTime: scheduleDate };
  }

  /**
   * Cancelar agendamento de campanha
   */
  async cancelScheduledCampaign(campaignId, reason = 'Cancelado pelo usuário') {
    const campaign = await db('campaigns')
      .where('id', campaignId)
      .first();

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    if (campaign.status !== 'scheduled') {
      throw new Error('Apenas campanhas agendadas podem ter o agendamento cancelado');
    }

    await db('campaigns')
      .where('id', campaignId)
      .update({
        status: 'draft',
        scheduled_at: null,
        updated_at: new Date()
      });

    await this.logSchedulingEvent(campaignId, 'cancelled', reason);

    logger.info('CampaignScheduler: Agendamento de campanha cancelado', {
      campaignId: campaignId,
      reason: reason
    });

    return { success: true };
  }
}

module.exports = { CampaignScheduler };