const db = require('../config/database');
const { logger } = require('../config/logger');

/**
 * SPRINT 2 - Advanced Segmentation Service
 * Serviço responsável pela segmentação avançada de contatos
 * Implementa filtros dinâmicos e cálculo de audiências
 */
class SegmentationService {
  constructor() {
    this.fieldMappings = {
      // Campos demográficos
      'email': 'contacts.email',
      'first_name': 'contacts.first_name',
      'last_name': 'contacts.last_name',
      'full_name': 'contacts.full_name',
      'phone': 'contacts.phone',
      'company': 'contacts.company',
      'job_title': 'contacts.job_title',
      'country': 'contacts.country',
      'city': 'contacts.city',
      'state': 'contacts.state',
      'language': 'contacts.language',
      'created_at': 'contacts.created_at',
      'subscribed_at': 'contacts.subscribed_at',
      
      // Campos comportamentais
      'last_activity_at': 'contacts.last_activity_at',
      'last_opened_at': 'contacts.last_opened_at',
      'last_clicked_at': 'contacts.last_clicked_at',
      'subscription_status': 'contacts.subscription_status',
      'status': 'contacts.status',
      
      // Campos de engajamento
      'total_emails_sent': 'contacts.total_emails_sent',
      'total_emails_opened': 'contacts.total_emails_opened',
      'total_emails_clicked': 'contacts.total_emails_clicked',
      'total_emails_bounced': 'contacts.total_emails_bounced',
      'engagement_score': 'contacts.engagement_score',
      
      // Campos personalizados (JSON)
      'custom_fields': 'contacts.custom_fields',
      'tags': 'contacts.tags'
    };
  }

  /**
   * Processar segmentação com base nos critérios fornecidos
   */
  async processSegmentation(userId, segmentCriteria) {
    try {
      logger.info('SegmentationService: Processando segmentação', {
        userId,
        rulesCount: segmentCriteria.rules?.length || 0,
        operator: segmentCriteria.operator || 'AND'
      });

      if (!segmentCriteria.rules || segmentCriteria.rules.length === 0) {
        return this.getAllActiveContacts(userId);
      }

      const query = this.buildSegmentationQuery(userId, segmentCriteria);
      const contacts = await query;

      logger.info('SegmentationService: Segmentação processada', {
        userId,
        contactsFound: contacts.length
      });

      return contacts;
    } catch (error) {
      logger.error('SegmentationService: Erro no processamento de segmentação', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Construir query de segmentação dinâmica
   */
  buildSegmentationQuery(userId, segmentCriteria) {
    let query = db('contacts')
      .where('contacts.user_id', userId)
      .where('contacts.status', 'active')
      .select([
        'contacts.id',
        'contacts.email', 
        'contacts.first_name',
        'contacts.last_name',
        'contacts.full_name',
        'contacts.phone',
        'contacts.company',
        'contacts.engagement_score',
        'contacts.last_activity_at',
        'contacts.subscription_status',
        'contacts.created_at',
        'contacts.custom_fields',
        'contacts.tags'
      ]);

    if (segmentCriteria.rules && segmentCriteria.rules.length > 0) {
      const operator = segmentCriteria.operator || 'AND';
      
      if (operator === 'AND') {
        // Aplicar todas as regras com AND
        segmentCriteria.rules.forEach(rule => {
          query = this.applyRuleToQuery(query, rule);
        });
      } else {
        // Aplicar regras com OR
        query = query.where(function() {
          segmentCriteria.rules.forEach((rule, index) => {
            if (index === 0) {
              this.where(function() {
                this.where(this.applyRuleCondition(rule));
              });
            } else {
              this.orWhere(function() {
                this.where(this.applyRuleCondition(rule));
              });
            }
          });
        });
      }
    }

    return query.orderBy('contacts.engagement_score', 'desc');
  }

  /**
   * Aplicar uma regra individual à query
   */
  applyRuleToQuery(query, rule) {
    const fieldPath = this.fieldMappings[rule.field] || rule.field;
    const value = rule.value;
    const operator = rule.operator;

    switch (operator) {
      case 'equals':
        if (rule.field === 'custom_fields' || rule.field === 'tags') {
          return query.whereRaw('JSON_CONTAINS(?, ?)', [fieldPath, JSON.stringify(value)]);
        }
        return query.where(fieldPath, '=', value);

      case 'not_equals':
        if (rule.field === 'custom_fields' || rule.field === 'tags') {
          return query.whereRaw('NOT JSON_CONTAINS(?, ?)', [fieldPath, JSON.stringify(value)]);
        }
        return query.where(fieldPath, '!=', value);

      case 'contains':
        return query.where(fieldPath, 'like', `%${value}%`);

      case 'starts_with':
        return query.where(fieldPath, 'like', `${value}%`);

      case 'ends_with':
        return query.where(fieldPath, 'like', `%${value}`);

      case 'is_empty':
        return query.where(function() {
          this.whereNull(fieldPath).orWhere(fieldPath, '=', '');
        });

      case 'is_not_empty':
        return query.whereNotNull(fieldPath).where(fieldPath, '!=', '');

      case 'greater_than':
        return query.where(fieldPath, '>', value);

      case 'less_than':
        return query.where(fieldPath, '<', value);

      case 'greater_equal':
        return query.where(fieldPath, '>=', value);

      case 'less_equal':
        return query.where(fieldPath, '<=', value);

      case 'between':
        const [min, max] = value.split(',').map(v => v.trim());
        return query.whereBetween(fieldPath, [min, max]);

      case 'before':
        return query.where(fieldPath, '<', new Date(value));

      case 'after':
        return query.where(fieldPath, '>', new Date(value));

      case 'last_days':
        const lastDays = parseInt(value);
        const lastDaysDate = new Date();
        lastDaysDate.setDate(lastDaysDate.getDate() - lastDays);
        return query.where(fieldPath, '>=', lastDaysDate);

      case 'next_days':
        const nextDays = parseInt(value);
        const nextDaysDate = new Date();
        nextDaysDate.setDate(nextDaysDate.getDate() + nextDays);
        return query.where(fieldPath, '<=', nextDaysDate);

      default:
        logger.warn('SegmentationService: Operador não reconhecido', { operator, rule });
        return query;
    }
  }

  /**
   * Obter todos os contatos ativos (fallback)
   */
  async getAllActiveContacts(userId) {
    return await db('contacts')
      .where('user_id', userId)
      .where('status', 'active')
      .where('subscription_status', 'subscribed')
      .select([
        'id', 'email', 'first_name', 'last_name', 'full_name', 
        'phone', 'company', 'engagement_score', 'last_activity_at',
        'subscription_status', 'created_at', 'custom_fields', 'tags'
      ])
      .orderBy('engagement_score', 'desc');
  }

  /**
   * Calcular preview de audiência com estatísticas
   */
  async calculateAudiencePreview(userId, segmentCriteria) {
    try {
      logger.info('SegmentationService: Calculando preview de audiência', { userId });

      // Total de contatos ativos do usuário
      const totalContacts = await db('contacts')
        .where('user_id', userId)
        .where('status', 'active')
        .count('* as count')
        .first();

      // Contatos que atendem aos critérios
      let matchingContacts = 0;
      let segmentsBreakdown = [];

      if (segmentCriteria.rules && segmentCriteria.rules.length > 0) {
        const query = this.buildSegmentationQuery(userId, segmentCriteria);
        const matchingResult = await query.clone().count('* as count').first();
        matchingContacts = matchingResult.count || 0;

        // Calcular breakdown por categorias
        segmentsBreakdown = await this.calculateSegmentBreakdown(userId, segmentCriteria);
      } else {
        matchingContacts = totalContacts.count || 0;
      }

      const preview = {
        total_contacts: totalContacts.count || 0,
        matching_contacts: matchingContacts,
        match_percentage: totalContacts.count > 0 ? 
          Math.round((matchingContacts / totalContacts.count) * 100) : 0,
        segments_breakdown: segmentsBreakdown,
        last_calculated: new Date().toISOString()
      };

      logger.info('SegmentationService: Preview calculado', { 
        userId, 
        total: preview.total_contacts,
        matching: preview.matching_contacts,
        percentage: preview.match_percentage
      });

      return preview;
    } catch (error) {
      logger.error('SegmentationService: Erro no cálculo de preview', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Calcular breakdown por segmentos
   */
  async calculateSegmentBreakdown(userId, segmentCriteria) {
    const breakdown = [];

    try {
      // Contatos com alto engajamento (score > 70)
      const highEngagement = await db('contacts')
        .where('user_id', userId)
        .where('status', 'active')
        .where('engagement_score', '>', 70)
        .count('* as count')
        .first();
      breakdown.push({ segment: 'Alto Engajamento', count: highEngagement.count || 0 });

      // Contatos recentes (últimos 30 dias)
      const recent = await db('contacts')
        .where('user_id', userId)
        .where('status', 'active')
        .where('created_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .count('* as count')
        .first();
      breakdown.push({ segment: 'Novos (30 dias)', count: recent.count || 0 });

      // Contatos ativos (atividade nos últimos 90 dias)
      const active = await db('contacts')
        .where('user_id', userId)
        .where('status', 'active')
        .where('last_activity_at', '>=', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
        .count('* as count')
        .first();
      breakdown.push({ segment: 'Ativos (90 dias)', count: active.count || 0 });

      // Contatos com emails abertos
      const emailOpeners = await db('contacts')
        .where('user_id', userId)
        .where('status', 'active')
        .where('total_emails_opened', '>', 0)
        .count('* as count')
        .first();
      breakdown.push({ segment: 'Abriram Emails', count: emailOpeners.count || 0 });

    } catch (error) {
      logger.warn('SegmentationService: Erro no cálculo de breakdown', { error: error.message });
    }

    return breakdown;
  }

  /**
   * Salvar segmento dinâmico
   */
  async saveSegment(userId, segmentData) {
    try {
      const segmentId = await db('contact_segments').insert({
        user_id: userId,
        name: segmentData.name,
        description: segmentData.description || null,
        type: 'dynamic',
        criteria: JSON.stringify(segmentData.criteria),
        criteria_description: this.buildCriteriaDescription(segmentData.criteria),
        is_active: true,
        auto_update: segmentData.auto_update !== false,
        update_frequency_minutes: segmentData.update_frequency_minutes || 60,
        color: segmentData.color || '#3B82F6',
        settings: segmentData.settings ? JSON.stringify(segmentData.settings) : null,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');

      const segmentIdValue = Array.isArray(segmentId) ? segmentId[0].id || segmentId[0] : segmentId;

      // Calcular contatos do segmento
      await this.updateSegmentMembers(segmentIdValue);

      logger.info('SegmentationService: Segmento salvo', { 
        userId, 
        segmentId: segmentIdValue,
        name: segmentData.name
      });

      return segmentIdValue;
    } catch (error) {
      logger.error('SegmentationService: Erro ao salvar segmento', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Atualizar membros de um segmento
   */
  async updateSegmentMembers(segmentId) {
    try {
      const segment = await db('contact_segments').where('id', segmentId).first();
      if (!segment) {
        throw new Error('Segmento não encontrado');
      }

      const criteria = JSON.parse(segment.criteria || '{}');
      const contacts = await this.processSegmentation(segment.user_id, criteria);

      // Limpar membros existentes
      await db('contact_segment_members').where('segment_id', segmentId).del();

      // Adicionar novos membros
      if (contacts.length > 0) {
        const members = contacts.map(contact => ({
          contact_id: contact.id,
          segment_id: segmentId,
          added_at: new Date(),
          added_by: 'system'
        }));

        await db('contact_segment_members').insert(members);
      }

      // Atualizar contador no segmento
      await db('contact_segments')
        .where('id', segmentId)
        .update({
          contact_count: contacts.length,
          last_calculated_at: new Date(),
          updated_at: new Date()
        });

      logger.info('SegmentationService: Membros do segmento atualizados', {
        segmentId,
        memberCount: contacts.length
      });

      return contacts.length;
    } catch (error) {
      logger.error('SegmentationService: Erro ao atualizar membros do segmento', {
        segmentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Construir descrição legível dos critérios
   */
  buildCriteriaDescription(criteria) {
    if (!criteria.rules || criteria.rules.length === 0) {
      return 'Todos os contatos ativos';
    }

    const descriptions = criteria.rules.map(rule => {
      const fieldName = this.getFieldDisplayName(rule.field);
      const operatorName = this.getOperatorDisplayName(rule.operator);
      return `${fieldName} ${operatorName} ${rule.value}`;
    });

    const operator = criteria.operator || 'AND';
    return descriptions.join(` ${operator} `);
  }

  /**
   * Obter nome de exibição do campo
   */
  getFieldDisplayName(field) {
    const displayNames = {
      'email': 'Email',
      'first_name': 'Nome',
      'last_name': 'Sobrenome',
      'engagement_score': 'Score de Engajamento',
      'total_emails_opened': 'Emails Abertos',
      'total_emails_clicked': 'Emails Clicados',
      'last_activity_at': 'Última Atividade',
      'created_at': 'Data de Cadastro',
      'country': 'País',
      'city': 'Cidade'
    };
    return displayNames[field] || field;
  }

  /**
   * Obter nome de exibição do operador
   */
  getOperatorDisplayName(operator) {
    const operatorNames = {
      'equals': 'igual a',
      'not_equals': 'diferente de',
      'contains': 'contém',
      'greater_than': 'maior que',
      'less_than': 'menor que',
      'is_empty': 'está vazio',
      'is_not_empty': 'não está vazio'
    };
    return operatorNames[operator] || operator;
  }

  /**
   * Obter estatísticas de segmentação do usuário
   */
  async getSegmentationStats(userId) {
    try {
      const stats = {};

      // Total de segmentos
      const totalSegments = await db('contact_segments')
        .where('user_id', userId)
        .where('is_active', true)
        .count('* as count')
        .first();
      stats.total_segments = totalSegments.count || 0;

      // Segmentos dinâmicos
      const dynamicSegments = await db('contact_segments')
        .where('user_id', userId)
        .where('is_active', true)
        .where('type', 'dynamic')
        .count('* as count')
        .first();
      stats.dynamic_segments = dynamicSegments.count || 0;

      // Total de contatos em segmentos
      const segmentedContacts = await db('contact_segment_members')
        .join('contact_segments', 'contact_segment_members.segment_id', 'contact_segments.id')
        .where('contact_segments.user_id', userId)
        .where('contact_segments.is_active', true)
        .count('contact_segment_members.contact_id as count')
        .first();
      stats.segmented_contacts = segmentedContacts.count || 0;

      // Último update
      const lastUpdate = await db('contact_segments')
        .where('user_id', userId)
        .where('is_active', true)
        .max('last_calculated_at as last_update')
        .first();
      stats.last_update = lastUpdate.last_update;

      return stats;
    } catch (error) {
      logger.error('SegmentationService: Erro ao obter estatísticas', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { SegmentationService };