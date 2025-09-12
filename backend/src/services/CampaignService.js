const db = require('../config/database');
const { queueService } = require('./queueService');

/**
 * FASE 2.1 - Campaign Service
 * Serviço completo para gerenciamento de campanhas de email
 */
class CampaignService {

  /**
   * Criar uma nova campanha
   */
  async createCampaign(userId, campaignData) {
    const campaign = await db('campaigns').insert({
      user_id: userId,
      name: campaignData.name,
      description: campaignData.description || null,
      type: campaignData.type || 'one_time',
      template_id: campaignData.template_id || null,
      subject_line: campaignData.subject_line || null,
      from_email: campaignData.from_email || null,
      from_name: campaignData.from_name || null,
      reply_to: campaignData.reply_to || null,
      scheduled_at: campaignData.scheduled_at || null,
      segment_criteria: campaignData.segment_criteria ? JSON.stringify(campaignData.segment_criteria) : null,
      recipient_list: campaignData.recipient_list ? JSON.stringify(campaignData.recipient_list) : null,
      use_segmentation: campaignData.use_segmentation || false,
      send_settings: campaignData.send_settings ? JSON.stringify(campaignData.send_settings) : null,
      tracking_settings: campaignData.tracking_settings ? JSON.stringify(campaignData.tracking_settings) : null,
      metadata: campaignData.metadata ? JSON.stringify(campaignData.metadata) : null,
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date()
    }).returning('id');

    const campaignId = Array.isArray(campaign) ? campaign[0].id || campaign[0] : campaign;
    
    // Se há lista de destinatários, inserir na tabela campaign_recipients
    if (campaignData.recipient_list && campaignData.recipient_list.length > 0) {
      await this.addRecipientsToCampaign(campaignId, campaignData.recipient_list);
    }

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Obter campanha por ID
   */
  async getCampaignById(userId, campaignId) {
    const campaign = await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .first();

    if (!campaign) {
      throw new Error('Campanha não encontrada');
    }

    // Parse JSON fields
    campaign.segment_criteria = campaign.segment_criteria ? JSON.parse(campaign.segment_criteria) : null;
    campaign.recipient_list = campaign.recipient_list ? JSON.parse(campaign.recipient_list) : null;
    campaign.send_settings = campaign.send_settings ? JSON.parse(campaign.send_settings) : null;
    campaign.tracking_settings = campaign.tracking_settings ? JSON.parse(campaign.tracking_settings) : null;
    campaign.metadata = campaign.metadata ? JSON.parse(campaign.metadata) : null;

    return campaign;
  }

  /**
   * Listar campanhas do usuário
   */
  async getCampaigns(userId, options = {}) {
    const { page = 1, limit = 20, status, type, search, sort = 'created_at', order = 'desc' } = options;
    const offset = (page - 1) * limit;

    let query = db('campaigns')
      .where('user_id', userId);

    // Filtros
    if (status && status !== 'all') {
      query = query.where('status', status);
    }

    if (type && type !== 'all') {
      query = query.where('type', type);
    }

    if (search) {
      query = query.where(function() {
        this.where('name', 'like', `%${search}%`)
            .orWhere('description', 'like', `%${search}%`)
            .orWhere('subject_line', 'like', `%${search}%`);
      });
    }

    // Consulta principal com paginação
    const campaigns = await query
      .clone()
      .orderBy(sort, order)
      .limit(limit)
      .offset(offset);

    // Contar total
    const total = await query.clone().count('* as count').first();

    // Parse JSON fields para cada campanha
    const parsedCampaigns = campaigns.map(campaign => {
      campaign.segment_criteria = campaign.segment_criteria ? JSON.parse(campaign.segment_criteria) : null;
      campaign.recipient_list = campaign.recipient_list ? JSON.parse(campaign.recipient_list) : null;
      campaign.send_settings = campaign.send_settings ? JSON.parse(campaign.send_settings) : null;
      campaign.tracking_settings = campaign.tracking_settings ? JSON.parse(campaign.tracking_settings) : null;
      campaign.metadata = campaign.metadata ? JSON.parse(campaign.metadata) : null;
      return campaign;
    });

    return {
      campaigns: parsedCampaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count || 0,
        pages: Math.ceil((total.count || 0) / limit)
      }
    };
  }

  /**
   * Atualizar campanha
   */
  async updateCampaign(userId, campaignId, updateData) {
    const campaign = await this.getCampaignById(userId, campaignId);
    
    if (campaign.status === 'sent' || campaign.status === 'sending') {
      throw new Error('Não é possível editar campanhas que já foram enviadas ou estão sendo enviadas');
    }

    const updates = {
      ...updateData,
      last_modified_by: userId,
      updated_at: new Date()
    };

    // Serializar campos JSON
    ['segment_criteria', 'recipient_list', 'send_settings', 'tracking_settings', 'metadata'].forEach(field => {
      if (updates[field] !== undefined) {
        updates[field] = updates[field] ? JSON.stringify(updates[field]) : null;
      }
    });

    await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .update(updates);

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Excluir campanha
   */
  async deleteCampaign(userId, campaignId) {
    const campaign = await this.getCampaignById(userId, campaignId);
    
    if (campaign.status === 'sending') {
      throw new Error('Não é possível excluir campanhas que estão sendo enviadas');
    }

    await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .delete();

    return { success: true };
  }

  /**
   * Duplicar campanha
   */
  async duplicateCampaign(userId, campaignId) {
    const originalCampaign = await this.getCampaignById(userId, campaignId);
    
    // Remove campos únicos e de status
    const duplicateData = {
      ...originalCampaign,
      name: `${originalCampaign.name} (Cópia)`,
      status: 'draft',
      scheduled_at: null,
      started_at: null,
      completed_at: null,
      emails_sent: 0,
      emails_delivered: 0,
      emails_bounced: 0,
      emails_opened: 0,
      emails_clicked: 0,
      unsubscribes: 0,
      spam_reports: 0,
      delivery_rate: 0,
      open_rate: 0,
      click_rate: 0,
      unsubscribe_rate: 0,
      id: undefined,
      created_at: undefined,
      updated_at: undefined
    };

    return this.createCampaign(userId, duplicateData);
  }

  /**
   * Adicionar destinatários à campanha
   */
  async addRecipientsToCampaign(campaignId, recipients) {
    const recipientData = recipients.map(recipient => ({
      campaign_id: campaignId,
      email: recipient.email,
      first_name: recipient.first_name || null,
      last_name: recipient.last_name || null,
      custom_fields: recipient.custom_fields ? JSON.stringify(recipient.custom_fields) : null,
      created_at: new Date(),
      updated_at: new Date()
    }));

    await db('campaign_recipients').insert(recipientData);

    // Atualizar contador na campanha
    await db('campaigns')
      .where('id', campaignId)
      .update({
        total_recipients: recipients.length,
        updated_at: new Date()
      });
  }

  /**
   * Obter destinatários da campanha
   */
  async getCampaignRecipients(userId, campaignId, options = {}) {
    const campaign = await this.getCampaignById(userId, campaignId);
    const { page = 1, limit = 50, status, search } = options;
    const offset = (page - 1) * limit;

    let query = db('campaign_recipients')
      .where('campaign_id', campaignId);

    if (status && status !== 'all') {
      query = query.where('status', status);
    }

    if (search) {
      query = query.where(function() {
        this.where('email', 'like', `%${search}%`)
            .orWhere('first_name', 'like', `%${search}%`)
            .orWhere('last_name', 'like', `%${search}%`);
      });
    }

    const recipients = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const total = await query.clone().count('* as count').first();

    return {
      recipients: recipients.map(recipient => {
        recipient.custom_fields = recipient.custom_fields ? JSON.parse(recipient.custom_fields) : null;
        return recipient;
      }),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count || 0,
        pages: Math.ceil((total.count || 0) / limit)
      }
    };
  }

  /**
   * Agendar campanha para envio
   */
  async scheduleCampaign(userId, campaignId, scheduledAt) {
    const campaign = await this.getCampaignById(userId, campaignId);

    if (campaign.status !== 'draft') {
      throw new Error('Apenas campanhas em rascunho podem ser agendadas');
    }

    const scheduleDate = new Date(scheduledAt);
    const now = new Date();

    if (scheduleDate <= now) {
      throw new Error('Data de agendamento deve ser no futuro');
    }

    await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .update({
        status: 'scheduled',
        scheduled_at: scheduleDate,
        updated_at: new Date()
      });

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Enviar campanha imediatamente
   */
  async sendCampaign(userId, campaignId) {
    const campaign = await this.getCampaignById(userId, campaignId);

    if (!['draft', 'scheduled'].includes(campaign.status)) {
      throw new Error('Campanha deve estar em rascunho ou agendada para ser enviada');
    }

    // Validações básicas
    if (!campaign.template_id && !campaign.subject_line) {
      throw new Error('Campanha deve ter template ou linha de assunto');
    }

    if (campaign.total_recipients === 0) {
      throw new Error('Campanha deve ter pelo menos um destinatário');
    }

    // Criar execução da campanha
    const executionId = await db('campaign_executions').insert({
      campaign_id: campaignId,
      user_id: userId,
      started_at: new Date(),
      total_recipients: campaign.total_recipients,
      status: 'running',
      created_at: new Date(),
      updated_at: new Date()
    }).returning('id');

    // Atualizar status da campanha
    await db('campaigns')
      .where('id', campaignId)
      .update({
        status: 'sending',
        started_at: new Date(),
        updated_at: new Date()
      });

    // Enfileirar emails para envio
    await this.queueCampaignEmails(campaignId, executionId);

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Pausar campanha
   */
  async pauseCampaign(userId, campaignId) {
    const campaign = await this.getCampaignById(userId, campaignId);

    if (campaign.status !== 'sending') {
      throw new Error('Apenas campanhas sendo enviadas podem ser pausadas');
    }

    await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .update({
        status: 'paused',
        updated_at: new Date()
      });

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Retomar campanha pausada
   */
  async resumeCampaign(userId, campaignId) {
    const campaign = await this.getCampaignById(userId, campaignId);

    if (campaign.status !== 'paused') {
      throw new Error('Apenas campanhas pausadas podem ser retomadas');
    }

    await db('campaigns')
      .where('id', campaignId)
      .where('user_id', userId)
      .update({
        status: 'sending',
        updated_at: new Date()
      });

    // Retomar envio dos emails pendentes
    await this.queueCampaignEmails(campaignId);

    return this.getCampaignById(userId, campaignId);
  }

  /**
   * Enfileirar emails da campanha para envio
   */
  async queueCampaignEmails(campaignId, executionId = null) {
    const recipients = await db('campaign_recipients')
      .where('campaign_id', campaignId)
      .where('status', 'pending');

    const campaign = await db('campaigns').where('id', campaignId).first();

    for (const recipient of recipients) {
      const emailData = {
        campaignId: campaignId,
        executionId: executionId,
        recipientId: recipient.id,
        to_email: recipient.email,
        to_name: recipient.first_name && recipient.last_name ? 
          `${recipient.first_name} ${recipient.last_name}` : 
          recipient.first_name || recipient.last_name || null,
        template_id: campaign.template_id,
        subject: campaign.subject_line,
        from_email: campaign.from_email,
        from_name: campaign.from_name,
        reply_to: campaign.reply_to,
        custom_fields: recipient.custom_fields ? JSON.parse(recipient.custom_fields) : null,
        tracking_settings: campaign.tracking_settings ? JSON.parse(campaign.tracking_settings) : null
      };

      await queueService.addCampaignEmailJob(emailData);
    }
  }

  /**
   * Obter estatísticas da campanha
   */
  async getCampaignStats(userId, campaignId) {
    const campaign = await this.getCampaignById(userId, campaignId);

    // Estatísticas detalhadas dos destinatários
    const recipientStats = await db('campaign_recipients')
      .where('campaign_id', campaignId)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as sent'),
        db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered'),
        db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced'),
        db.raw('COUNT(CASE WHEN status = "failed" THEN 1 END) as failed'),
        db.raw('COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened'),
        db.raw('COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked')
      )
      .first();

    // Calcular taxas
    const total = recipientStats.total || 0;
    const delivered = recipientStats.delivered || 0;
    const opened = recipientStats.opened || 0;
    const clicked = recipientStats.clicked || 0;

    return {
      campaign: campaign,
      stats: {
        total_recipients: total,
        sent: recipientStats.sent || 0,
        delivered: delivered,
        bounced: recipientStats.bounced || 0,
        failed: recipientStats.failed || 0,
        opened: opened,
        clicked: clicked,
        delivery_rate: total > 0 ? Math.round((delivered / total) * 100 * 100) / 100 : 0,
        open_rate: delivered > 0 ? Math.round((opened / delivered) * 100 * 100) / 100 : 0,
        click_rate: delivered > 0 ? Math.round((clicked / delivered) * 100 * 100) / 100 : 0,
        click_to_open_rate: opened > 0 ? Math.round((clicked / opened) * 100 * 100) / 100 : 0
      }
    };
  }

  /**
   * Obter histórico de execuções da campanha
   */
  async getCampaignExecutions(userId, campaignId) {
    await this.getCampaignById(userId, campaignId); // Verificar acesso

    const executions = await db('campaign_executions')
      .where('campaign_id', campaignId)
      .orderBy('started_at', 'desc');

    return executions.map(execution => {
      execution.execution_stats = execution.execution_stats ? JSON.parse(execution.execution_stats) : null;
      execution.execution_log = execution.execution_log ? JSON.parse(execution.execution_log) : null;
      return execution;
    });
  }
}

module.exports = { CampaignService };