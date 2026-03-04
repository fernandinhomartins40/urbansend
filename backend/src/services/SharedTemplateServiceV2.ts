import db from '../config/database'
import { logger } from '../config/logger'
import LegacySharedTemplateService from './SharedTemplateService'

const DEFAULT_TEMPLATE_CATEGORIES = [
  { name: 'marketing', description: 'Templates para campanhas de marketing', icon: 'megaphone', color: '#0ea5e9', display_order: 1 },
  { name: 'transactional', description: 'Templates para emails transacionais', icon: 'receipt', color: '#10b981', display_order: 2 },
  { name: 'newsletter', description: 'Templates para newsletters', icon: 'newspaper', color: '#6366f1', display_order: 3 },
  { name: 'welcome', description: 'Templates de boas-vindas', icon: 'hand-wave', color: '#f59e0b', display_order: 4 },
  { name: 'ecommerce', description: 'Templates para e-commerce', icon: 'shopping-cart', color: '#ef4444', display_order: 5 },
  { name: 'event', description: 'Templates para eventos', icon: 'calendar', color: '#06b6d4', display_order: 6 },
  { name: 'education', description: 'Templates educacionais', icon: 'academic-cap', color: '#84cc16', display_order: 7 },
  { name: 'healthcare', description: 'Templates para saude', icon: 'heart', color: '#ec4899', display_order: 8 },
  { name: 'finance', description: 'Templates para setor financeiro', icon: 'currency-dollar', color: '#14b8a6', display_order: 9 },
  { name: 'general', description: 'Templates gerais', icon: 'template', color: '#6b7280', display_order: 10 }
]

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

class SharedTemplateServiceV2 {
  private readonly cache = new Map<string, { data: any; timestamp: number }>()
  private readonly supportCache = new Map<string, { value: boolean; timestamp: number }>()
  private readonly CACHE_TTL = 5 * 60 * 1000
  private readonly SUPPORT_CACHE_TTL = 2 * 60 * 1000

  private async hasTable(tableName: string): Promise<boolean> {
    const key = `table:${tableName}`
    const cached = this.supportCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.SUPPORT_CACHE_TTL) {
      return cached.value
    }

    try {
      const exists = await db.schema.hasTable(tableName)
      this.supportCache.set(key, { value: exists, timestamp: Date.now() })
      return exists
    } catch {
      this.supportCache.set(key, { value: false, timestamp: Date.now() })
      return false
    }
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const key = `column:${tableName}:${columnName}`
    const cached = this.supportCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.SUPPORT_CACHE_TTL) {
      return cached.value
    }

    try {
      const exists = await db.schema.hasColumn(tableName, columnName)
      this.supportCache.set(key, { value: exists, timestamp: Date.now() })
      return exists
    } catch {
      this.supportCache.set(key, { value: false, timestamp: Date.now() })
      return false
    }
  }

  private async hasView(viewName: string): Promise<boolean> {
    const key = `view:${viewName}`
    const cached = this.supportCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.SUPPORT_CACHE_TTL) {
      return cached.value
    }

    try {
      await db(viewName).select('id').limit(1)
      this.supportCache.set(key, { value: true, timestamp: Date.now() })
      return true
    } catch {
      this.supportCache.set(key, { value: false, timestamp: Date.now() })
      return false
    }
  }

  async getPublicTemplates(filters: TemplateFilters = {}, userId?: number) {
    try {
      const normalizedFilters = { ...filters }
      const cacheKey = `public_templates:${JSON.stringify(normalizedFilters)}:${userId || 'guest'}`
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data
      }

      const hasPublicView = await this.hasView('view_public_templates')
      const hasCategoryTable = await this.hasTable('template_categories')
      const hasFavoritesTable = await this.hasTable('user_favorite_templates')

      let baseQuery: any = hasPublicView
        ? db('view_public_templates').where('is_active', true)
        : db('email_templates as t')
          .select(
            't.id',
            't.user_id',
            't.name',
            't.subject',
            't.html_content',
            't.text_content',
            't.description',
            't.category',
            't.template_type',
            't.tags',
            't.usage_count',
            't.clone_count',
            't.rating',
            't.total_ratings',
            't.is_public',
            't.is_active',
            't.industry',
            't.difficulty_level',
            't.estimated_time_minutes',
            't.preview_image_url',
            't.created_at',
            't.updated_at',
            db.raw('COALESCE(t.rating, 0) as avg_rating'),
            db.raw('COALESCE(t.total_ratings, 0) as total_reviews'),
            db.raw('0 as favorite_count')
          )
          .where('t.is_active', true)
          .where(function() {
            this.where('t.template_type', 'system')
              .orWhere('t.is_public', true)
          })

      if (!hasPublicView && hasCategoryTable) {
        baseQuery = baseQuery
          .leftJoin('template_categories as c', 'c.name', 't.category')
          .select(
            'c.name as category_name',
            'c.icon as category_icon',
            'c.color as category_color'
          )
      } else if (!hasPublicView) {
        baseQuery = baseQuery.select(
          db.raw('NULL as category_name'),
          db.raw('NULL as category_icon'),
          db.raw('NULL as category_color')
        )
      }

      if (normalizedFilters.category) {
        baseQuery = hasPublicView
          ? baseQuery.where('category', normalizedFilters.category)
          : baseQuery.where('t.category', normalizedFilters.category)
      }

      if (normalizedFilters.industry) {
        baseQuery = hasPublicView
          ? baseQuery.where('industry', normalizedFilters.industry)
          : baseQuery.where('t.industry', normalizedFilters.industry)
      }

      if (normalizedFilters.difficulty) {
        baseQuery = hasPublicView
          ? baseQuery.where('difficulty_level', normalizedFilters.difficulty)
          : baseQuery.where('t.difficulty_level', normalizedFilters.difficulty)
      }

      if (normalizedFilters.template_type) {
        baseQuery = hasPublicView
          ? baseQuery.where('template_type', normalizedFilters.template_type)
          : baseQuery.where('t.template_type', normalizedFilters.template_type)
      }

      if (normalizedFilters.min_rating) {
        baseQuery = hasPublicView
          ? baseQuery.where('avg_rating', '>=', normalizedFilters.min_rating)
          : baseQuery.where('t.rating', '>=', normalizedFilters.min_rating)
      }

      if (normalizedFilters.search) {
        const searchTerm = `%${normalizedFilters.search}%`
        baseQuery = hasPublicView
          ? baseQuery.where(function() {
            this.where('name', 'like', searchTerm)
              .orWhere('description', 'like', searchTerm)
              .orWhere('tags', 'like', searchTerm)
          })
          : baseQuery.where(function() {
            this.where('t.name', 'like', searchTerm)
              .orWhere('t.description', 'like', searchTerm)
              .orWhere('t.tags', 'like', searchTerm)
          })
      }

      if (normalizedFilters.tags && normalizedFilters.tags.length > 0) {
        normalizedFilters.tags.forEach((tag) => {
          baseQuery = hasPublicView
            ? baseQuery.where('tags', 'like', `%${tag}%`)
            : baseQuery.where('t.tags', 'like', `%${tag}%`)
        })
      }

      const sortBy = normalizedFilters.sort_by || 'rating'
      const sortOrder = normalizedFilters.sort_order || 'desc'
      let query: any = baseQuery

      switch (sortBy) {
        case 'rating':
          query = query.orderBy('avg_rating', sortOrder).orderBy('total_reviews', 'desc')
          break
        case 'usage':
          query = hasPublicView ? query.orderBy('usage_count', sortOrder) : query.orderBy('t.usage_count', sortOrder)
          break
        case 'date':
          query = hasPublicView ? query.orderBy('created_at', sortOrder) : query.orderBy('t.created_at', sortOrder)
          break
        case 'name':
          query = hasPublicView ? query.orderBy('name', sortOrder) : query.orderBy('t.name', sortOrder)
          break
        default:
          query = query.orderBy('avg_rating', 'desc')
      }

      const page = Math.max(1, normalizedFilters.page || 1)
      const limit = Math.min(Math.max(1, normalizedFilters.limit || 20), 50)
      const offset = (page - 1) * limit

      const [templates, totalCount] = await Promise.all([
        query.clone().limit(limit).offset(offset),
        db.from(baseQuery.clone().as('filtered_templates')).count('* as total').first()
      ])

      if (userId && templates.length > 0 && hasFavoritesTable) {
        const templateIds = templates.map((template) => template.id)
        const favorites = await db('user_favorite_templates')
          .where('user_id', userId)
          .whereIn('template_id', templateIds)
          .pluck('template_id')
        templates.forEach((template) => {
          template.is_favorited = favorites.includes(template.id)
        })
      }

      const normalizedTemplates = templates.map((template) => ({
        ...template,
        avg_rating: Number(template.avg_rating || template.rating || 0),
        rating: Number(template.rating || 0),
        total_reviews: Number(template.total_reviews || template.total_ratings || 0),
        total_ratings: Number(template.total_ratings || template.total_reviews || 0),
        usage_count: Number(template.usage_count || 0),
        clone_count: Number(template.clone_count || 0),
        favorite_count: Number(template.favorite_count || 0),
        estimated_time_minutes: Number(template.estimated_time_minutes || 5)
      }))

      const total = Number((totalCount as any)?.total || 0)
      const totalPages = Math.ceil(total / limit)
      const result = {
        templates: normalizedTemplates,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }

      this.cache.set(cacheKey, { data: result, timestamp: Date.now() })
      return result
    } catch (error) {
      logger.error('Erro ao buscar templates publicos (V2):', error)
      throw new Error('Falha ao carregar templates')
    }
  }

  async getSystemTemplates(category?: string) {
    try {
      const hasDescription = await this.hasColumn('email_templates', 'description')
      const hasTags = await this.hasColumn('email_templates', 'tags')
      const hasRating = await this.hasColumn('email_templates', 'rating')
      const hasUsage = await this.hasColumn('email_templates', 'usage_count')
      const hasDifficulty = await this.hasColumn('email_templates', 'difficulty_level')
      const hasEstimate = await this.hasColumn('email_templates', 'estimated_time_minutes')
      const hasPreview = await this.hasColumn('email_templates', 'preview_image_url')

      let query = db('email_templates')
        .where('template_type', 'system')
        .where('is_active', true)

      if (category) {
        query = query.where('category', category)
      }

      const selectFields: any[] = [
        'id',
        'name',
        'subject',
        'html_content',
        'category',
        'created_at'
      ]

      selectFields.push(hasDescription ? 'description' : db.raw('NULL as description'))
      selectFields.push(hasTags ? 'tags' : db.raw('NULL as tags'))
      selectFields.push(hasRating ? 'rating' : db.raw('0 as rating'))
      selectFields.push(hasUsage ? 'usage_count' : db.raw('0 as usage_count'))
      selectFields.push(hasDifficulty ? 'difficulty_level' : db.raw("'easy' as difficulty_level"))
      selectFields.push(hasEstimate ? 'estimated_time_minutes' : db.raw('5 as estimated_time_minutes'))
      selectFields.push(hasPreview ? 'preview_image_url' : db.raw('NULL as preview_image_url'))

      return query.select(selectFields)
        .orderBy('rating', 'desc')
        .orderBy('usage_count', 'desc')
    } catch (error) {
      logger.error('Erro ao buscar templates do sistema (V2):', error)
      throw new Error('Falha ao carregar templates do sistema')
    }
  }

  async getCategories() {
    try {
      const hasCategoriesTable = await this.hasTable('template_categories')
      const hasTemplatesTable = await this.hasTable('email_templates')
      const hasTemplateType = hasTemplatesTable ? await this.hasColumn('email_templates', 'template_type') : false
      const hasIsPublic = hasTemplatesTable ? await this.hasColumn('email_templates', 'is_public') : false

      const countsMap = new Map<string, number>()
      if (hasTemplatesTable) {
        let countQuery = db('email_templates')
          .select('category')
          .count('* as total')
          .where('is_active', true)
          .groupBy('category')

        if (hasTemplateType && hasIsPublic) {
          countQuery = countQuery.where(function() {
            this.where('template_type', 'system')
              .orWhere('is_public', true)
          })
        }

        const counts = await countQuery
        counts.forEach((item) => {
          const category = String(item.category || 'general')
          countsMap.set(category, Number(item.total || 0))
        })
      }

      if (hasCategoriesTable) {
        const categories = await db('template_categories')
          .where('is_active', true)
          .orderBy('display_order')

        if (categories.length > 0) {
          return categories.map((category) => ({
            ...category,
            template_count: countsMap.get(category.name) || 0
          }))
        }
      }

      return DEFAULT_TEMPLATE_CATEGORIES.map((category, index) => ({
        id: index + 1,
        ...category,
        is_active: true,
        template_count: countsMap.get(category.name) || 0
      }))
    } catch (error) {
      logger.error('Erro ao buscar categorias (V2):', error)
      return DEFAULT_TEMPLATE_CATEGORIES.map((category, index) => ({
        id: index + 1,
        ...category,
        is_active: true,
        template_count: 0
      }))
    }
  }

  async recordUsage(templateId: number, userId: number) {
    try {
      const hasUsageCount = await this.hasColumn('email_templates', 'usage_count')
      if (!hasUsageCount) {
        return
      }

      await db('email_templates')
        .where('id', templateId)
        .increment('usage_count', 1)

      logger.info('Template usado:', {
        templateId,
        userId,
        timestamp: new Date()
      })
    } catch (error) {
      logger.error('Erro ao registrar uso do template (V2):', error)
    }
  }

  async getTemplateStats(templateId: number) {
    try {
      const hasRatingsTable = await this.hasTable('template_ratings')
      const hasCloneHistoryTable = await this.hasTable('template_clone_history')

      const template = await db('email_templates')
        .where('id', templateId)
        .select(['usage_count', 'clone_count', 'rating', 'total_ratings'])
        .first()

      const ratings = hasRatingsTable
        ? await db('template_ratings')
          .where('template_id', templateId)
          .select(['rating', 'created_at'])
          .orderBy('created_at', 'desc')
          .limit(10)
        : []

      const clones = hasCloneHistoryTable
        ? await db('template_clone_history')
          .where('original_template_id', templateId)
          .count('* as total_clones')
          .first()
        : { total_clones: 0 }

      return {
        usage_count: Number(template?.usage_count || 0),
        clone_count: Number(template?.clone_count || 0),
        avg_rating: Number(template?.rating || 0),
        total_ratings: Number(template?.total_ratings || 0),
        recent_ratings: ratings,
        total_clones: Number(clones?.total_clones || 0)
      }
    } catch (error) {
      logger.error('Erro ao obter estatisticas de template (V2):', error)
      throw new Error('Erro interno do servidor')
    }
  }

  cloneTemplate(...args: any[]) {
    return (LegacySharedTemplateService as any).cloneTemplate(...args)
  }

  rateTemplate(...args: any[]) {
    return (LegacySharedTemplateService as any).rateTemplate(...args)
  }

  toggleFavorite(...args: any[]) {
    return (LegacySharedTemplateService as any).toggleFavorite(...args)
  }

  getUserFavorites(...args: any[]) {
    return (LegacySharedTemplateService as any).getUserFavorites(...args)
  }

  smartSearch(...args: any[]) {
    return (LegacySharedTemplateService as any).smartSearch(...args)
  }

  getTemplateReviews(...args: any[]) {
    return (LegacySharedTemplateService as any).getTemplateReviews(...args)
  }

  getCollections(...args: any[]) {
    return (LegacySharedTemplateService as any).getCollections(...args)
  }

  createCollection(...args: any[]) {
    return (LegacySharedTemplateService as any).createCollection(...args)
  }

  getCollection(...args: any[]) {
    return (LegacySharedTemplateService as any).getCollection(...args)
  }

  addTemplateToCollection(...args: any[]) {
    return (LegacySharedTemplateService as any).addTemplateToCollection(...args)
  }

  removeTemplateFromCollection(...args: any[]) {
    return (LegacySharedTemplateService as any).removeTemplateFromCollection(...args)
  }

  getTrendingTemplates(...args: any[]) {
    return (LegacySharedTemplateService as any).getTrendingTemplates(...args)
  }

  getAdvancedAnalytics(...args: any[]) {
    return (LegacySharedTemplateService as any).getAdvancedAnalytics(...args)
  }

  exportTemplates(...args: any[]) {
    return (LegacySharedTemplateService as any).exportTemplates(...args)
  }

  importTemplates(...args: any[]) {
    return (LegacySharedTemplateService as any).importTemplates(...args)
  }
}

export default new SharedTemplateServiceV2()
