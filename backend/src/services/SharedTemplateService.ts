/**
 * SharedTemplateService - Sistema Avançado de Templates Compartilhados
 * 
 * FUNCIONALIDADES:
 * - Templates de sistema (criados por admins)
 * - Templates públicos de usuários
 * - Sistema de busca avançada
 * - Clonagem de templates
 * - Avaliações e favoritos
 * - Coleções organizadas
 * - Analytics de uso
 */

import db from '../config/database'
import { logger } from '../config/logger'

interface TemplateFilters {
  category?: string
  industry?: string
  difficulty?: 'easy' | 'medium' | 'advanced'
  template_type?: 'user' | 'system' | 'shared'
  search?: string
  tags?: string[]
  min_rating?: number
  sort_by?: 'rating' | 'usage' | 'date' | 'name'
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

interface TemplateRating {
  template_id: number
  user_id: number
  rating: number
  review?: string
}

interface TemplateCollection {
  id?: number
  user_id: number | null
  name: string
  description?: string
  is_public: boolean
  is_featured: boolean
}

export class SharedTemplateService {
  private static instance: SharedTemplateService
  private cache = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutos

  public static getInstance(): SharedTemplateService {
    if (!SharedTemplateService.instance) {
      SharedTemplateService.instance = new SharedTemplateService()
    }
    return SharedTemplateService.instance
  }

  /**
   * === BUSCA E LISTAGEM ===
   */

  /**
   * Buscar templates públicos (sistema + compartilhados)
   */
  async getPublicTemplates(filters: TemplateFilters = {}, userId?: number) {
    try {
      const cacheKey = `public_templates:${JSON.stringify(filters)}:${userId || 'guest'}`
      
      // Verificar cache
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)
        if (Date.now() - cached.timestamp < this.CACHE_TTL) {
          return cached.data
        }
      }

      let query = db('view_public_templates')
        .where('is_active', true)
        
      // Aplicar filtros
      if (filters.category) {
        query = query.where('category', filters.category)
      }
      
      if (filters.industry) {
        query = query.where('industry', filters.industry)
      }
      
      if (filters.difficulty) {
        query = query.where('difficulty_level', filters.difficulty)
      }
      
      if (filters.template_type) {
        query = query.where('template_type', filters.template_type)
      }
      
      if (filters.min_rating) {
        query = query.where('avg_rating', '>=', filters.min_rating)
      }
      
      if (filters.search) {
        query = query.where(function() {
          this.where('name', 'like', `%${filters.search}%`)
              .orWhere('description', 'like', `%${filters.search}%`)
              .orWhere('tags', 'like', `%${filters.search}%`)
        })
      }
      
      if (filters.tags && filters.tags.length > 0) {
        filters.tags.forEach(tag => {
          query = query.where('tags', 'like', `%${tag}%`)
        })
      }

      // Ordenação
      const sortBy = filters.sort_by || 'rating'
      const sortOrder = filters.sort_order || 'desc'
      
      switch (sortBy) {
        case 'rating':
          query = query.orderBy('avg_rating', sortOrder).orderBy('total_reviews', 'desc')
          break
        case 'usage':
          query = query.orderBy('usage_count', sortOrder)
          break
        case 'date':
          query = query.orderBy('created_at', sortOrder)
          break
        case 'name':
          query = query.orderBy('name', sortOrder)
          break
        default:
          query = query.orderBy('avg_rating', 'desc')
      }

      // Paginação
      const page = filters.page || 1
      const limit = Math.min(filters.limit || 20, 50)
      const offset = (page - 1) * limit

      const [templates, totalCount] = await Promise.all([
        query.limit(limit).offset(offset),
        db('view_public_templates')
          .where('is_active', true)
          .count('* as total')
          .first()
      ])

      // Se usuário logado, verificar favoritos
      if (userId && templates.length > 0) {
        const templateIds = templates.map(t => t.id)
        const favorites = await db('user_favorite_templates')
          .where('user_id', userId)
          .whereIn('template_id', templateIds)
          .pluck('template_id')

        templates.forEach(template => {
          template.is_favorited = favorites.includes(template.id)
        })
      }

      const result = {
        templates,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: totalCount.total,
          total_pages: Math.ceil(Number(totalCount.total) / limit),
          has_next: page < Math.ceil(Number(totalCount.total) / limit),
          has_prev: page > 1
        }
      }

      // Cachear resultado
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      return result

    } catch (error) {
      logger.error('Erro ao buscar templates públicos:', error)
      throw new Error('Falha ao carregar templates')
    }
  }

  /**
   * Obter templates do sistema (criados por admins)
   */
  async getSystemTemplates(category?: string) {
    try {
      let query = db('email_templates')
        .where('template_type', 'system')
        .where('is_active', true)

      if (category) {
        query = query.where('category', category)
      }

      const templates = await query
        .select([
          'id', 'name', 'subject', 'html_content', 'description',
          'category', 'tags', 'rating', 'usage_count', 
          'difficulty_level', 'estimated_time_minutes',
          'preview_image_url', 'created_at'
        ])
        .orderBy('rating', 'desc')
        .orderBy('usage_count', 'desc')

      return templates

    } catch (error) {
      logger.error('Erro ao buscar templates do sistema:', error)
      throw new Error('Falha ao carregar templates do sistema')
    }
  }

  /**
   * Obter categorias com contador de templates
   */
  async getCategories() {
    try {
      const categories = await db('template_categories')
        .leftJoin('email_templates', function() {
          this.on('template_categories.name', '=', 'email_templates.category')
              .andOn('email_templates.is_active', '=', db.raw('1'))
              .andOn(function() {
                this.on('email_templates.is_public', '=', db.raw('1'))
                    .orOn('email_templates.template_type', '=', db.raw("'system'"))
              })
        })
        .where('template_categories.is_active', true)
        .groupBy('template_categories.id')
        .select([
          'template_categories.*',
          db.raw('COUNT(email_templates.id) as template_count')
        ])
        .orderBy('template_categories.display_order')

      return categories

    } catch (error) {
      logger.error('Erro ao buscar categorias:', error)
      throw new Error('Falha ao carregar categorias')
    }
  }

  /**
   * === CLONAGEM DE TEMPLATES ===
   */

  /**
   * Clonar template para usuário
   */
  async cloneTemplate(templateId: number, userId: number, customizations: any = {}) {
    try {
      return await db.transaction(async (trx) => {
        // Verificar se template existe e é público/sistema
        const template = await trx('email_templates')
          .where('id', templateId)
          .where(function() {
            this.where('template_type', 'system')
                .orWhere('is_public', true)
          })
          .first()

        if (!template) {
          throw new Error('Template não encontrado ou não é público')
        }

        // Verificar se usuário pode clonar mais templates (limite)
        const userTemplateCount = await trx('email_templates')
          .where('user_id', userId)
          .count('* as total')
          .first()

        if (Number(userTemplateCount.total) >= 100) { // Limite de 100 templates por usuário
          throw new Error('Limite de templates por usuário atingido')
        }

        // Criar template clonado
        const clonedTemplate = {
          user_id: userId,
          name: customizations.name || `${template.name} (Cópia)`,
          subject: customizations.subject || template.subject,
          html_content: customizations.html_content || template.html_content,
          text_content: customizations.text_content || template.text_content,
          description: customizations.description || template.description,
          template_type: 'user',
          category: customizations.category || template.category,
          tags: JSON.stringify(customizations.tags || JSON.parse(template.tags || '[]')),
          is_public: false,
          is_active: true,
          original_template_id: templateId,
          industry: customizations.industry || template.industry,
          difficulty_level: template.difficulty_level,
          estimated_time_minutes: template.estimated_time_minutes,
          created_at: new Date(),
          updated_at: new Date()
        }

        const [clonedId] = await trx('email_templates').insert(clonedTemplate)

        // Registrar histórico de clonagem
        await trx('template_clone_history').insert({
          original_template_id: templateId,
          cloned_template_id: clonedId,
          user_id: userId,
          customizations: JSON.stringify(customizations),
          created_at: new Date()
        })

        // Incrementar contador de clones
        await trx('email_templates')
          .where('id', templateId)
          .increment('clone_count', 1)

        // Buscar template criado
        const newTemplate = await trx('email_templates')
          .where('id', clonedId)
          .first()

        // Limpar cache
        this.clearCache()

        logger.info('Template clonado com sucesso:', {
          originalId: templateId,
          clonedId: clonedId,
          userId: userId
        })

        return newTemplate

      })

    } catch (error) {
      logger.error('Erro ao clonar template:', error)
      throw error
    }
  }

  /**
   * === AVALIAÇÕES E FAVORITOS ===
   */

  /**
   * Avaliar template
   */
  async rateTemplate(templateRating: TemplateRating) {
    try {
      return await db.transaction(async (trx) => {
        // Verificar se template existe e é público/sistema
        const template = await trx('email_templates')
          .where('id', templateRating.template_id)
          .where(function() {
            this.where('template_type', 'system')
                .orWhere('is_public', true)
          })
          .first()

        if (!template) {
          throw new Error('Template não encontrado ou não pode ser avaliado')
        }

        // Verificar se usuário já avaliou
        const existingRating = await trx('template_ratings')
          .where('template_id', templateRating.template_id)
          .where('user_id', templateRating.user_id)
          .first()

        if (existingRating) {
          // Atualizar avaliação existente
          await trx('template_ratings')
            .where('id', existingRating.id)
            .update({
              rating: templateRating.rating,
              review: templateRating.review,
              updated_at: new Date()
            })
        } else {
          // Inserir nova avaliação
          await trx('template_ratings').insert({
            ...templateRating,
            created_at: new Date(),
            updated_at: new Date()
          })
        }

        // Limpar cache
        this.clearCache()

        return { success: true }

      })

    } catch (error) {
      logger.error('Erro ao avaliar template:', error)
      throw error
    }
  }

  /**
   * Adicionar/remover template dos favoritos
   */
  async toggleFavorite(templateId: number, userId: number) {
    try {
      const existing = await db('user_favorite_templates')
        .where('template_id', templateId)
        .where('user_id', userId)
        .first()

      if (existing) {
        await db('user_favorite_templates')
          .where('id', existing.id)
          .del()
        return { favorited: false }
      } else {
        await db('user_favorite_templates').insert({
          template_id: templateId,
          user_id: userId,
          created_at: new Date()
        })
        return { favorited: true }
      }

    } catch (error) {
      logger.error('Erro ao gerenciar favorito:', error)
      throw error
    }
  }

  /**
   * Obter templates favoritos do usuário
   */
  async getUserFavorites(userId: number, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit

      const [templates, totalCount] = await Promise.all([
        db('email_templates')
          .join('user_favorite_templates', 'email_templates.id', 'user_favorite_templates.template_id')
          .where('user_favorite_templates.user_id', userId)
          .where('email_templates.is_active', true)
          .select([
            'email_templates.*',
            'user_favorite_templates.created_at as favorited_at'
          ])
          .orderBy('user_favorite_templates.created_at', 'desc')
          .limit(limit)
          .offset(offset),
        
        db('user_favorite_templates')
          .join('email_templates', 'email_templates.id', 'user_favorite_templates.template_id')
          .where('user_favorite_templates.user_id', userId)
          .where('email_templates.is_active', true)
          .count('* as total')
          .first()
      ])

      return {
        templates,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: totalCount.total,
          total_pages: Math.ceil(Number(totalCount.total) / limit),
          has_next: page < Math.ceil(Number(totalCount.total) / limit),
          has_prev: page > 1
        }
      }

    } catch (error) {
      logger.error('Erro ao buscar favoritos:', error)
      throw error
    }
  }

  /**
   * === COLEÇÕES ===
   */


  /**
   * === ANALYTICS ===
   */

  /**
   * Registrar uso de template
   */
  async recordUsage(templateId: number, userId: number) {
    try {
      await db('email_templates')
        .where('id', templateId)
        .increment('usage_count', 1)

      // Log do uso para analytics futuras
      logger.info('Template usado:', {
        templateId,
        userId,
        timestamp: new Date()
      })

    } catch (error) {
      logger.error('Erro ao registrar uso:', error)
    }
  }

  /**
   * Obter estatísticas de templates
   */
  async getTemplateStats(templateId: number) {
    try {
      const [template, ratings, clones] = await Promise.all([
        db('email_templates')
          .where('id', templateId)
          .select(['usage_count', 'clone_count', 'rating', 'total_ratings'])
          .first(),
        
        db('template_ratings')
          .where('template_id', templateId)
          .select(['rating', 'created_at'])
          .orderBy('created_at', 'desc')
          .limit(10),
        
        db('template_clone_history')
          .where('original_template_id', templateId)
          .count('* as total_clones')
          .first()
      ])

      return {
        usage_count: template?.usage_count || 0,
        clone_count: template?.clone_count || 0,
        avg_rating: template?.rating || 0,
        total_ratings: template?.total_ratings || 0,
        recent_ratings: ratings,
        total_clones: clones.total_clones || 0
      }

    } catch (error) {
      logger.error('Erro ao obter estatísticas:', error)
      throw error
    }
  }

  /**
   * === UTILITÁRIOS ===
   */

  /**
   * Limpar cache
   */
  private clearCache() {
    this.cache.clear()
  }

  /**
   * Busca avançada com IA (placeholder para futura implementação)
   */
  async smartSearch(query: string, userId?: number) {
    // Implementação futura com AI/ML para busca semântica
    // Por enquanto, usa busca tradicional
    return this.getPublicTemplates({
      search: query,
      sort_by: 'rating'
    }, userId)
  }

  /**
   * === REVIEWS E AVALIAÇÕES ===
   */

  /**
   * Obter reviews de um template
   */
  async getTemplateReviews(templateId: number, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit

      const [reviews, total] = await Promise.all([
        db('template_ratings as tr')
          .select(
            'tr.id',
            'tr.rating',
            'tr.review',
            'tr.created_at',
            'tr.updated_at',
            'u.email as user_email',
            'u.name as user_name'
          )
          .leftJoin('users as u', 'tr.user_id', 'u.id')
          .where('tr.template_id', templateId)
          .whereNotNull('tr.review')
          .orderBy('tr.created_at', 'desc')
          .limit(limit)
          .offset(offset),

        db('template_ratings')
          .where('template_id', templateId)
          .whereNotNull('review')
          .count('* as total')
          .first()
      ])

      return {
        reviews,
        pagination: {
          page,
          limit,
          total: Number(total?.total || 0),
          totalPages: Math.ceil(Number(total?.total || 0) / limit)
        }
      }

    } catch (error) {
      logger.error('Erro ao buscar reviews:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * === COLEÇÕES ===
   */

  /**
   * Obter coleções de templates
   */
  async getCollections(userId?: number, isPublic: boolean = false, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit

      let query = db('template_collections as tc')
        .select(
          'tc.id',
          'tc.name',
          'tc.description',
          'tc.is_public',
          'tc.created_at',
          'tc.updated_at',
          'u.email as creator_email',
          'u.name as creator_name'
        )
        .leftJoin('users as u', 'tc.user_id', 'u.id')

      if (isPublic) {
        query = query.where('tc.is_public', true)
      } else if (userId) {
        query = query.where(function() {
          this.where('tc.user_id', userId)
              .orWhere('tc.is_public', true)
        })
      }

      const [collections, total] = await Promise.all([
        query.clone()
          .orderBy('tc.created_at', 'desc')
          .limit(limit)
          .offset(offset),

        query.clone().count('* as total').first()
      ])

      return {
        collections,
        pagination: {
          page,
          limit,
          total: Number(total?.total || 0),
          totalPages: Math.ceil(Number(total?.total || 0) / limit)
        }
      }

    } catch (error) {
      logger.error('Erro ao buscar coleções:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * Criar nova coleção
   */
  async createCollection(userId: number, data: {
    name: string;
    description?: string;
    is_public: boolean;
  }) {
    try {
      const [collectionId] = await db('template_collections')
        .insert({
          user_id: userId,
          name: data.name,
          description: data.description || null,
          is_public: data.is_public,
          created_at: new Date(),
          updated_at: new Date()
        })

      // Buscar a coleção criada
      const collection = await db('template_collections')
        .where('id', collectionId)
        .first()

      return collection

    } catch (error) {
      logger.error('Erro ao criar coleção:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * Obter uma coleção específica
   */
  async getCollection(collectionId: number, userId?: number) {
    try {
      let query = db('template_collections as tc')
        .select(
          'tc.id',
          'tc.name',
          'tc.description',
          'tc.is_public',
          'tc.created_at',
          'tc.updated_at',
          'u.email as creator_email',
          'u.name as creator_name'
        )
        .leftJoin('users as u', 'tc.user_id', 'u.id')
        .where('tc.id', collectionId)

      // Se não é pública, só pode ver se é o criador
      if (userId) {
        query = query.where(function() {
          this.where('tc.is_public', true)
              .orWhere('tc.user_id', userId)
        })
      } else {
        query = query.where('tc.is_public', true)
      }

      const collection = await query.first()

      if (!collection) {
        return null
      }

      // Buscar templates da coleção
      const templates = await db('template_collection_items as ct')
        .select(
          'et.id',
          'et.name',
          'et.subject',
          'et.description',
          'et.category',
          'et.template_type',
          'ct.added_at'
        )
        .leftJoin('email_templates as et', 'ct.template_id', 'et.id')
        .where('ct.collection_id', collectionId)
        .orderBy('ct.added_at', 'desc')

      return {
        ...collection,
        templates
      }

    } catch (error) {
      logger.error('Erro ao buscar coleção:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * Adicionar template à coleção
   */
  async addTemplateToCollection(collectionId: number, templateId: number, userId: number) {
    try {
      return await db.transaction(async (trx) => {
        // Verificar se é dono da coleção
        const collection = await trx('template_collections')
          .where('id', collectionId)
          .where('user_id', userId)
          .first()

        if (!collection) {
          throw new Error('Coleção não encontrada ou sem permissão')
        }

        // Verificar se template existe
        const template = await trx('email_templates')
          .where('id', templateId)
          .first()

        if (!template) {
          throw new Error('Template não encontrado')
        }

        // Verificar se já não está na coleção
        const exists = await trx('template_collection_items')
          .where('collection_id', collectionId)
          .where('template_id', templateId)
          .first()

        if (exists) {
          throw new Error('Template já está na coleção')
        }

        // Adicionar à coleção
        await trx('template_collection_items').insert({
          collection_id: collectionId,
          template_id: templateId,
          added_at: new Date()
        })

        return { success: true }
      })

    } catch (error) {
      logger.error('Erro ao adicionar template à coleção:', error)
      throw error
    }
  }

  /**
   * Remover template da coleção
   */
  async removeTemplateFromCollection(collectionId: number, templateId: number, userId: number) {
    try {
      return await db.transaction(async (trx) => {
        // Verificar se é dono da coleção
        const collection = await trx('template_collections')
          .where('id', collectionId)
          .where('user_id', userId)
          .first()

        if (!collection) {
          throw new Error('Coleção não encontrada ou sem permissão')
        }

        // Remover da coleção
        const deleted = await trx('template_collection_items')
          .where('collection_id', collectionId)
          .where('template_id', templateId)
          .del()

        if (deleted === 0) {
          throw new Error('Template não encontrado na coleção')
        }

        return { success: true }
      })

    } catch (error) {
      logger.error('Erro ao remover template da coleção:', error)
      throw error
    }
  }

  /**
   * === ANALYTICS AVANÇADAS ===
   */

  /**
   * Obter templates em tendência
   */
  async getTrendingTemplates(period: 'day' | 'week' | 'month' = 'week', limit: number = 10) {
    try {
      const periodMap = {
        day: 1,
        week: 7,
        month: 30
      }

      const days = periodMap[period]
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const trending = await db('email_templates as et')
        .select(
          'et.id',
          'et.name',
          'et.subject',
          'et.description',
          'et.category',
          'et.template_type',
          'et.usage_count',
          'et.clone_count',
          'et.created_at',
          'et.updated_at'
        )
        .select(db.raw('AVG(tr.rating) as avg_rating'))
        .select(db.raw('COUNT(tr.id) as rating_count'))
        .leftJoin('template_ratings as tr', 'et.id', 'tr.template_id')
        .where(function() {
          this.where('et.template_type', 'system')
              .orWhere('et.is_public', true)
        })
        .where('et.updated_at', '>=', cutoffDate)
        .groupBy(
          'et.id', 'et.name', 'et.subject', 'et.description',
          'et.category', 'et.template_type', 'et.usage_count',
          'et.clone_count', 'et.created_at', 'et.updated_at'
        )
        .orderByRaw('(et.usage_count + et.clone_count + COUNT(tr.id) * 2) DESC')
        .limit(limit)

      return trending.map(template => ({
        ...template,
        avg_rating: template.avg_rating ? Math.round(template.avg_rating * 10) / 10 : 0,
        rating_count: Number(template.rating_count || 0)
      }))

    } catch (error) {
      logger.error('Erro ao buscar templates em tendência:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * Obter analytics avançadas
   */
  async getAdvancedAnalytics(templateId?: number, userId?: number) {
    try {
      if (templateId) {
        // Analytics específicas de um template
        const [template, ratings, usage] = await Promise.all([
          db('email_templates')
            .select('id', 'name', 'usage_count', 'clone_count', 'created_at')
            .where('id', templateId)
            .first(),

          db('template_ratings')
            .select(
              db.raw('AVG(rating) as avg_rating'),
              db.raw('COUNT(*) as total_ratings'),
              db.raw('COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_ratings')
            )
            .where('template_id', templateId)
            .first() as any,

          db('template_ratings')
            .select(
              db.raw('DATE(created_at) as date'),
              db.raw('COUNT(*) as daily_usage')
            )
            .where('template_id', templateId)
            .where('created_at', '>=', db.raw("date('now', '-30 days')"))
            .groupBy(db.raw('DATE(created_at)'))
            .orderBy('date')
        ])

        return {
          template,
          ratings: {
            average: ratings?.avg_rating ? Math.round(ratings.avg_rating * 10) / 10 : 0,
            total: Number(ratings?.total_ratings || 0),
            satisfaction: ratings?.total_ratings ?
              Math.round((Number(ratings.positive_ratings || 0) / Number(ratings.total_ratings)) * 100) : 0
          },
          usage_trend: usage
        }
      } else {
        // Analytics gerais do usuário
        const [userTemplates, totalStats, categoryStats] = await Promise.all([
          db('email_templates')
            .select(
              db.raw('COUNT(*) as total_templates'),
              db.raw('SUM(usage_count) as total_usage'),
              db.raw('SUM(clone_count) as total_clones')
            )
            .where('user_id', userId)
            .first() as any,

          db('email_templates as et')
            .select(
              db.raw('COUNT(DISTINCT et.id) as public_templates'),
              db.raw('AVG(tr.rating) as avg_rating'),
              db.raw('COUNT(tr.id) as total_ratings')
            )
            .leftJoin('template_ratings as tr', 'et.id', 'tr.template_id')
            .where('et.user_id', userId)
            .where('et.is_public', true)
            .first() as any,

          db('email_templates')
            .select('category', db.raw('COUNT(*) as count'))
            .where('user_id', userId)
            .groupBy('category')
            .orderBy('count', 'desc')
            .limit(5)
        ])

        return {
          user_stats: {
            total_templates: Number(userTemplates?.total_templates || 0),
            total_usage: Number(userTemplates?.total_usage || 0),
            total_clones: Number(userTemplates?.total_clones || 0),
            public_templates: Number(totalStats?.public_templates || 0),
            avg_rating: totalStats?.avg_rating ? Math.round(totalStats.avg_rating * 10) / 10 : 0,
            total_ratings: Number(totalStats?.total_ratings || 0)
          },
          top_categories: categoryStats
        }
      }

    } catch (error) {
      logger.error('Erro ao buscar analytics:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * === IMPORT/EXPORT ===
   */

  /**
   * Export de templates em bulk
   */
  async exportTemplates(templateIds: number[], userId: number) {
    try {
      const templates = await db('email_templates')
        .select(
          'id', 'name', 'subject', 'html_content', 'text_content',
          'description', 'category', 'tags', 'variables', 'template_type',
          'is_public', 'created_at', 'updated_at'
        )
        .whereIn('id', templateIds)
        .where(function() {
          this.where('user_id', userId)
              .orWhere('template_type', 'system')
              .orWhere('is_public', true)
        })

      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        total_templates: templates.length,
        templates: templates.map(template => ({
          ...template,
          variables: typeof template.variables === 'string'
            ? JSON.parse(template.variables || '[]')
            : template.variables,
          tags: typeof template.tags === 'string'
            ? JSON.parse(template.tags || '[]')
            : template.tags
        }))
      }

      return exportData

    } catch (error) {
      logger.error('Erro ao exportar templates:', error)
      throw new Error('Erro interno do servidor')
    }
  }

  /**
   * Import de templates em bulk
   */
  async importTemplates(templates: any[], userId: number) {
    try {
      return await db.transaction(async (trx) => {
        const results = {
          imported: 0,
          skipped: 0,
          errors: []
        }

        for (const template of templates) {
          try {
            // Validar dados básicos
            if (!template.name || !template.html_content) {
              results.skipped++
              results.errors.push(`Template "${template.name || 'sem nome'}" - dados incompletos`)
              continue
            }

            // Verificar se já existe um template similar
            const existing = await trx('email_templates')
              .where('name', template.name)
              .where('user_id', userId)
              .first()

            if (existing) {
              results.skipped++
              results.errors.push(`Template "${template.name}" já existe`)
              continue
            }

            // Importar template
            await trx('email_templates').insert({
              user_id: userId,
              name: template.name,
              subject: template.subject || '',
              html_content: template.html_content,
              text_content: template.text_content || '',
              description: template.description || null,
              category: template.category || 'general',
              tags: JSON.stringify(template.tags || []),
              variables: JSON.stringify(template.variables || []),
              template_type: 'user', // Templates importados sempre são do usuário
              is_public: false, // Por segurança, não tornar público automaticamente
              created_at: new Date(),
              updated_at: new Date()
            })

            results.imported++

          } catch (error) {
            results.errors.push(`Template "${template.name}" - erro: ${(error as any).message}`)
          }
        }

        return results
      })

    } catch (error) {
      logger.error('Erro ao importar templates:', error)
      throw new Error('Erro interno do servidor')
    }
  }
}

export default SharedTemplateService.getInstance()