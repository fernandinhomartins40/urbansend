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

import { db } from '../config/database'
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
          total_pages: Math.ceil(totalCount.total / limit),
          has_next: page < Math.ceil(totalCount.total / limit),
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

        if (userTemplateCount.total >= 100) { // Limite de 100 templates por usuário
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
          total_pages: Math.ceil(totalCount.total / limit),
          has_next: page < Math.ceil(totalCount.total / limit),
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
   * Criar coleção
   */
  async createCollection(collection: TemplateCollection) {
    try {
      const [collectionId] = await db('template_collections').insert({
        ...collection,
        template_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      })

      const newCollection = await db('template_collections')
        .where('id', collectionId)
        .first()

      return newCollection

    } catch (error) {
      logger.error('Erro ao criar coleção:', error)
      throw error
    }
  }

  /**
   * Obter coleções públicas
   */
  async getPublicCollections(page: number = 1, limit: number = 12) {
    try {
      const offset = (page - 1) * limit

      const [collections, totalCount] = await Promise.all([
        db('template_collections')
          .where('is_public', true)
          .select('*')
          .orderBy('is_featured', 'desc')
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        
        db('template_collections')
          .where('is_public', true)
          .count('* as total')
          .first()
      ])

      return {
        collections,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: totalCount.total,
          total_pages: Math.ceil(totalCount.total / limit),
          has_next: page < Math.ceil(totalCount.total / limit),
          has_prev: page > 1
        }
      }

    } catch (error) {
      logger.error('Erro ao buscar coleções:', error)
      throw error
    }
  }

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
}

export default SharedTemplateService.getInstance()