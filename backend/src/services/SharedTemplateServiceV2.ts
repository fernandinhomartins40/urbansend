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

interface PublicTemplateColumnSupport {
  user_id: boolean
  name: boolean
  subject: boolean
  html_content: boolean
  text_content: boolean
  description: boolean
  category: boolean
  template_type: boolean
  tags: boolean
  usage_count: boolean
  clone_count: boolean
  rating: boolean
  total_ratings: boolean
  is_public: boolean
  is_active: boolean
  industry: boolean
  difficulty_level: boolean
  estimated_time_minutes: boolean
  preview_image_url: boolean
  created_at: boolean
  updated_at: boolean
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

  private buildEmptyPublicTemplatesResult(page: number, limit: number) {
    return {
      templates: [],
      pagination: {
        current_page: page,
        per_page: limit,
        total_count: 0,
        total_pages: 0,
        has_next: false,
        has_prev: false
      }
    }
  }

  private async getPublicTemplateColumnSupport(): Promise<PublicTemplateColumnSupport> {
    const [
      userId,
      name,
      subject,
      htmlContent,
      textContent,
      description,
      category,
      templateType,
      tags,
      usageCount,
      cloneCount,
      rating,
      totalRatings,
      isPublic,
      isActive,
      industry,
      difficultyLevel,
      estimatedTimeMinutes,
      previewImageUrl,
      createdAt,
      updatedAt
    ] = await Promise.all([
      this.hasColumn('email_templates', 'user_id'),
      this.hasColumn('email_templates', 'name'),
      this.hasColumn('email_templates', 'subject'),
      this.hasColumn('email_templates', 'html_content'),
      this.hasColumn('email_templates', 'text_content'),
      this.hasColumn('email_templates', 'description'),
      this.hasColumn('email_templates', 'category'),
      this.hasColumn('email_templates', 'template_type'),
      this.hasColumn('email_templates', 'tags'),
      this.hasColumn('email_templates', 'usage_count'),
      this.hasColumn('email_templates', 'clone_count'),
      this.hasColumn('email_templates', 'rating'),
      this.hasColumn('email_templates', 'total_ratings'),
      this.hasColumn('email_templates', 'is_public'),
      this.hasColumn('email_templates', 'is_active'),
      this.hasColumn('email_templates', 'industry'),
      this.hasColumn('email_templates', 'difficulty_level'),
      this.hasColumn('email_templates', 'estimated_time_minutes'),
      this.hasColumn('email_templates', 'preview_image_url'),
      this.hasColumn('email_templates', 'created_at'),
      this.hasColumn('email_templates', 'updated_at')
    ])

    return {
      user_id: userId,
      name,
      subject,
      html_content: htmlContent,
      text_content: textContent,
      description,
      category,
      template_type: templateType,
      tags,
      usage_count: usageCount,
      clone_count: cloneCount,
      rating,
      total_ratings: totalRatings,
      is_public: isPublic,
      is_active: isActive,
      industry,
      difficulty_level: difficultyLevel,
      estimated_time_minutes: estimatedTimeMinutes,
      preview_image_url: previewImageUrl,
      created_at: createdAt,
      updated_at: updatedAt
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
      const hasTemplatesTable = await this.hasTable('email_templates')
      const hasCategoryTable = await this.hasTable('template_categories')
      const hasFavoritesTable = await this.hasTable('user_favorite_templates')
      const templateColumns = !hasPublicView && hasTemplatesTable
        ? await this.getPublicTemplateColumnSupport()
        : null

      const page = Math.max(1, normalizedFilters.page || 1)
      const limit = Math.min(Math.max(1, normalizedFilters.limit || 20), 50)

      if (!hasPublicView && !hasTemplatesTable) {
        logger.warn('email_templates table not found; returning empty public templates list')
        return this.buildEmptyPublicTemplatesResult(page, limit)
      }

      const hasCategoryName = hasCategoryTable ? await this.hasColumn('template_categories', 'name') : false
      const hasCategoryIcon = hasCategoryTable ? await this.hasColumn('template_categories', 'icon') : false
      const hasCategoryColor = hasCategoryTable ? await this.hasColumn('template_categories', 'color') : false
      const canJoinCategories = Boolean(!hasPublicView && hasCategoryTable && hasCategoryName)
      const hasPublicViewIsActive = hasPublicView ? await this.hasColumn('view_public_templates', 'is_active') : false

      let baseQuery: any = hasPublicView
        ? db('view_public_templates')
        : db('email_templates as t')
          .select(
            't.id',
            templateColumns?.user_id ? 't.user_id' : db.raw('NULL as user_id'),
            templateColumns?.name ? 't.name' : db.raw("'Template' as name"),
            templateColumns?.subject ? 't.subject' : db.raw("'' as subject"),
            templateColumns?.html_content ? 't.html_content' : db.raw("'' as html_content"),
            templateColumns?.text_content ? 't.text_content' : db.raw("'' as text_content"),
            templateColumns?.description ? 't.description' : db.raw('NULL as description'),
            templateColumns?.category ? 't.category' : db.raw("'general' as category"),
            templateColumns?.template_type ? 't.template_type' : db.raw("'system' as template_type"),
            templateColumns?.tags ? 't.tags' : db.raw('NULL as tags'),
            templateColumns?.usage_count ? 't.usage_count' : db.raw('0 as usage_count'),
            templateColumns?.clone_count ? 't.clone_count' : db.raw('0 as clone_count'),
            templateColumns?.rating ? 't.rating' : db.raw('0 as rating'),
            templateColumns?.total_ratings ? 't.total_ratings' : db.raw('0 as total_ratings'),
            templateColumns?.is_public ? 't.is_public' : db.raw('0 as is_public'),
            templateColumns?.is_active ? 't.is_active' : db.raw('1 as is_active'),
            templateColumns?.industry ? 't.industry' : db.raw('NULL as industry'),
            templateColumns?.difficulty_level ? 't.difficulty_level' : db.raw("'easy' as difficulty_level"),
            templateColumns?.estimated_time_minutes ? 't.estimated_time_minutes' : db.raw('5 as estimated_time_minutes'),
            templateColumns?.preview_image_url ? 't.preview_image_url' : db.raw('NULL as preview_image_url'),
            templateColumns?.created_at ? 't.created_at' : db.raw('CURRENT_TIMESTAMP as created_at'),
            templateColumns?.updated_at ? 't.updated_at' : db.raw('CURRENT_TIMESTAMP as updated_at'),
            templateColumns?.rating ? db.raw('COALESCE(t.rating, 0) as avg_rating') : db.raw('0 as avg_rating'),
            templateColumns?.total_ratings ? db.raw('COALESCE(t.total_ratings, 0) as total_reviews') : db.raw('0 as total_reviews'),
            db.raw('0 as favorite_count')
          )

      if (hasPublicView && hasPublicViewIsActive) {
        baseQuery = baseQuery.where('is_active', true)
      }

      if (!hasPublicView && templateColumns?.is_active) {
        baseQuery = baseQuery.where('t.is_active', true)
      }

      if (!hasPublicView && templateColumns?.template_type && templateColumns?.is_public) {
        baseQuery = baseQuery.where(function() {
          this.where('t.template_type', 'system')
            .orWhere('t.is_public', true)
        })
      } else if (!hasPublicView && templateColumns?.template_type) {
        baseQuery = baseQuery.where('t.template_type', 'system')
      } else if (!hasPublicView && templateColumns?.is_public) {
        baseQuery = baseQuery.where('t.is_public', true)
      }

      if (canJoinCategories) {
        baseQuery = baseQuery
          .leftJoin('template_categories as c', 'c.name', 't.category')
          .select(
            'c.name as category_name',
            hasCategoryIcon ? 'c.icon as category_icon' : db.raw('NULL as category_icon'),
            hasCategoryColor ? 'c.color as category_color' : db.raw('NULL as category_color')
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
          : templateColumns?.category
            ? baseQuery.where('t.category', normalizedFilters.category)
            : baseQuery
      }

      if (normalizedFilters.industry) {
        baseQuery = hasPublicView
          ? baseQuery.where('industry', normalizedFilters.industry)
          : templateColumns?.industry
            ? baseQuery.where('t.industry', normalizedFilters.industry)
            : baseQuery
      }

      if (normalizedFilters.difficulty) {
        baseQuery = hasPublicView
          ? baseQuery.where('difficulty_level', normalizedFilters.difficulty)
          : templateColumns?.difficulty_level
            ? baseQuery.where('t.difficulty_level', normalizedFilters.difficulty)
            : baseQuery
      }

      if (normalizedFilters.template_type) {
        baseQuery = hasPublicView
          ? baseQuery.where('template_type', normalizedFilters.template_type)
          : templateColumns?.template_type
            ? baseQuery.where('t.template_type', normalizedFilters.template_type)
            : baseQuery
      }

      if (normalizedFilters.min_rating) {
        baseQuery = hasPublicView
          ? baseQuery.where('avg_rating', '>=', normalizedFilters.min_rating)
          : templateColumns?.rating
            ? baseQuery.where('t.rating', '>=', normalizedFilters.min_rating)
            : baseQuery
      }

      if (normalizedFilters.search) {
        const searchTerm = `%${normalizedFilters.search}%`
        if (hasPublicView) {
          baseQuery = baseQuery.where(function() {
            this.where('name', 'like', searchTerm)
              .orWhere('description', 'like', searchTerm)
              .orWhere('tags', 'like', searchTerm)
          })
        } else {
          const searchableColumns = [
            templateColumns?.name ? 't.name' : null,
            templateColumns?.description ? 't.description' : null,
            templateColumns?.tags ? 't.tags' : null
          ].filter(Boolean) as string[]

          if (searchableColumns.length > 0) {
            baseQuery = baseQuery.where(function() {
              searchableColumns.forEach((column, index) => {
                if (index === 0) {
                  this.where(column, 'like', searchTerm)
                } else {
                  this.orWhere(column, 'like', searchTerm)
                }
              })
            })
          }
        }
      }

      if (normalizedFilters.tags && normalizedFilters.tags.length > 0 && (hasPublicView || templateColumns?.tags)) {
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
          if (hasPublicView || templateColumns?.rating) {
            query = query.orderBy('avg_rating', sortOrder)
            if (hasPublicView || templateColumns?.total_ratings) {
              query = query.orderBy('total_reviews', 'desc')
            }
          } else if (templateColumns?.created_at) {
            query = query.orderBy('t.created_at', 'desc')
          } else {
            query = query.orderBy('t.id', 'desc')
          }
          break
        case 'usage':
          if (hasPublicView) {
            query = query.orderBy('usage_count', sortOrder)
          } else if (templateColumns?.usage_count) {
            query = query.orderBy('t.usage_count', sortOrder)
          } else if (templateColumns?.created_at) {
            query = query.orderBy('t.created_at', 'desc')
          } else {
            query = query.orderBy('t.id', 'desc')
          }
          break
        case 'date':
          if (hasPublicView) {
            query = query.orderBy('created_at', sortOrder)
          } else if (templateColumns?.created_at) {
            query = query.orderBy('t.created_at', sortOrder)
          } else {
            query = query.orderBy('t.id', 'desc')
          }
          break
        case 'name':
          if (hasPublicView) {
            query = query.orderBy('name', sortOrder)
          } else if (templateColumns?.name) {
            query = query.orderBy('t.name', sortOrder)
          } else if (templateColumns?.created_at) {
            query = query.orderBy('t.created_at', 'desc')
          } else {
            query = query.orderBy('t.id', 'desc')
          }
          break
        default:
          if (hasPublicView || templateColumns?.rating) {
            query = query.orderBy('avg_rating', 'desc')
          } else if (templateColumns?.created_at) {
            query = query.orderBy('t.created_at', 'desc')
          } else {
            query = query.orderBy('t.id', 'desc')
          }
      }

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
      const hasTemplatesTable = await this.hasTable('email_templates')
      if (!hasTemplatesTable) {
        return {
          usage_count: 0,
          clone_count: 0,
          avg_rating: 0,
          total_ratings: 0,
          recent_ratings: [],
          total_clones: 0
        }
      }

      const hasRatingsTable = await this.hasTable('template_ratings')
      const hasCloneHistoryTable = await this.hasTable('template_clone_history')
      const hasUsageCount = await this.hasColumn('email_templates', 'usage_count')
      const hasCloneCount = await this.hasColumn('email_templates', 'clone_count')
      const hasRating = await this.hasColumn('email_templates', 'rating')
      const hasTotalRatings = await this.hasColumn('email_templates', 'total_ratings')

      const template: any = await db('email_templates')
        .where('id', templateId)
        .select([
          hasUsageCount ? 'usage_count' : db.raw('0 as usage_count'),
          hasCloneCount ? 'clone_count' : db.raw('0 as clone_count'),
          hasRating ? 'rating' : db.raw('0 as rating'),
          hasTotalRatings ? 'total_ratings' : db.raw('0 as total_ratings')
        ])
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

  private createOperationalError(message: string, statusCode: number = 503) {
    const error: any = new Error(message)
    error.statusCode = statusCode
    error.isOperational = true
    return error
  }

  private isSchemaCompatibilityError(error: any): boolean {
    const code = String(error?.code || '')
    const message = String(error?.message || '').toLowerCase()
    return (
      code === '42P01' ||
      code === '42703' ||
      message.includes('does not exist') ||
      message.includes('no such table') ||
      message.includes('no such column') ||
      message.includes('unknown column')
    )
  }

  private buildEmptyCollectionsResult(page: number, limit: number) {
    return {
      collections: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    }
  }

  private buildEmptyGeneralAnalytics() {
    return {
      user_stats: {
        total_templates: 0,
        total_usage: 0,
        total_clones: 0,
        public_templates: 0,
        avg_rating: 0,
        total_ratings: 0
      },
      top_categories: []
    }
  }

  private buildEmptyTemplateAnalytics() {
    return {
      template: null,
      ratings: {
        average: 0,
        total: 0,
        satisfaction: 0
      },
      usage_trend: []
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

  async getCollections(userId?: number, isPublic: boolean = false, page: number = 1, limit: number = 20) {
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedLimit = Math.min(Math.max(1, Number(limit) || 20), 100)

    const hasCollectionsTable = await this.hasTable('template_collections')
    if (!hasCollectionsTable) {
      return this.buildEmptyCollectionsResult(normalizedPage, normalizedLimit)
    }

    try {
      return await (LegacySharedTemplateService as any).getCollections(
        userId,
        isPublic,
        normalizedPage,
        normalizedLimit
      )
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        logger.warn('Colecoes indisponiveis por incompatibilidade de schema; retornando lista vazia')
        return this.buildEmptyCollectionsResult(normalizedPage, normalizedLimit)
      }
      throw error
    }
  }

  async createCollection(userId: number, data: { name: string; description?: string; is_public: boolean }) {
    const hasCollectionsTable = await this.hasTable('template_collections')
    if (!hasCollectionsTable) {
      throw this.createOperationalError('Colecoes de templates nao estao habilitadas neste ambiente', 503)
    }

    try {
      return await (LegacySharedTemplateService as any).createCollection(userId, data)
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        throw this.createOperationalError('Colecoes de templates indisponiveis temporariamente', 503)
      }
      throw error
    }
  }

  async getCollection(collectionId: number, userId?: number) {
    const hasCollectionsTable = await this.hasTable('template_collections')
    if (!hasCollectionsTable) {
      return null
    }

    try {
      return await (LegacySharedTemplateService as any).getCollection(collectionId, userId)
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        logger.warn('Detalhes da colecao indisponiveis por incompatibilidade de schema')
        return null
      }
      throw error
    }
  }

  async addTemplateToCollection(collectionId: number, templateId: number, userId: number) {
    const hasCollectionsTable = await this.hasTable('template_collections')
    const hasCollectionItemsTable = await this.hasTable('template_collection_items')
    if (!hasCollectionsTable || !hasCollectionItemsTable) {
      throw this.createOperationalError('Colecoes de templates nao estao habilitadas neste ambiente', 503)
    }

    try {
      return await (LegacySharedTemplateService as any).addTemplateToCollection(collectionId, templateId, userId)
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        throw this.createOperationalError('Colecoes de templates indisponiveis temporariamente', 503)
      }
      throw error
    }
  }

  async removeTemplateFromCollection(collectionId: number, templateId: number, userId: number) {
    const hasCollectionsTable = await this.hasTable('template_collections')
    const hasCollectionItemsTable = await this.hasTable('template_collection_items')
    if (!hasCollectionsTable || !hasCollectionItemsTable) {
      throw this.createOperationalError('Colecoes de templates nao estao habilitadas neste ambiente', 503)
    }

    try {
      return await (LegacySharedTemplateService as any).removeTemplateFromCollection(collectionId, templateId, userId)
    } catch (error) {
      if (this.isSchemaCompatibilityError(error)) {
        throw this.createOperationalError('Colecoes de templates indisponiveis temporariamente', 503)
      }
      throw error
    }
  }

  async getTrendingTemplates(period: 'day' | 'week' | 'month' = 'week', limit: number = 10) {
    try {
      const hasTemplatesTable = await this.hasTable('email_templates')
      if (!hasTemplatesTable) {
        return []
      }

      const [
        hasName,
        hasSubject,
        hasDescription,
        hasCategory,
        hasTemplateType,
        hasIsPublic,
        hasUsageCount,
        hasCloneCount,
        hasCreatedAt,
        hasUpdatedAt
      ] = await Promise.all([
        this.hasColumn('email_templates', 'name'),
        this.hasColumn('email_templates', 'subject'),
        this.hasColumn('email_templates', 'description'),
        this.hasColumn('email_templates', 'category'),
        this.hasColumn('email_templates', 'template_type'),
        this.hasColumn('email_templates', 'is_public'),
        this.hasColumn('email_templates', 'usage_count'),
        this.hasColumn('email_templates', 'clone_count'),
        this.hasColumn('email_templates', 'created_at'),
        this.hasColumn('email_templates', 'updated_at')
      ])

      const hasRatingsTable = await this.hasTable('template_ratings')
      const [hasRatingsTemplateId, hasRatingsValue] = hasRatingsTable
        ? await Promise.all([
          this.hasColumn('template_ratings', 'template_id'),
          this.hasColumn('template_ratings', 'rating')
        ])
        : [false, false]
      const canJoinRatings = hasRatingsTable && hasRatingsTemplateId && hasRatingsValue

      const periodMap = { day: 1, week: 7, month: 30 }
      const days = periodMap[period] || 7
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      let query: any = db('email_templates as et')
        .select(
          'et.id',
          hasName ? 'et.name' : db.raw("'Template' as name"),
          hasSubject ? 'et.subject' : db.raw("'' as subject"),
          hasDescription ? 'et.description' : db.raw('NULL as description'),
          hasCategory ? 'et.category' : db.raw("'general' as category"),
          hasTemplateType ? 'et.template_type' : db.raw("'system' as template_type"),
          hasUsageCount ? 'et.usage_count' : db.raw('0 as usage_count'),
          hasCloneCount ? 'et.clone_count' : db.raw('0 as clone_count'),
          hasCreatedAt ? 'et.created_at' : db.raw('CURRENT_TIMESTAMP as created_at'),
          hasUpdatedAt ? 'et.updated_at' : db.raw('CURRENT_TIMESTAMP as updated_at')
        )

      if (canJoinRatings) {
        query = query
          .leftJoin('template_ratings as tr', 'et.id', 'tr.template_id')
          .select(db.raw('COALESCE(AVG(tr.rating), 0) as avg_rating'))
          .select(db.raw('COUNT(tr.template_id) as rating_count'))
      } else {
        query = query
          .select(db.raw('0 as avg_rating'))
          .select(db.raw('0 as rating_count'))
      }

      if (hasTemplateType && hasIsPublic) {
        query = query.where(function() {
          this.where('et.template_type', 'system')
            .orWhere('et.is_public', true)
        })
      } else if (hasTemplateType) {
        query = query.where('et.template_type', 'system')
      } else if (hasIsPublic) {
        query = query.where('et.is_public', true)
      }

      if (hasUpdatedAt) {
        query = query.where('et.updated_at', '>=', cutoffDate)
      } else if (hasCreatedAt) {
        query = query.where('et.created_at', '>=', cutoffDate)
      }

      if (canJoinRatings) {
        const groupByColumns = ['et.id']
        if (hasName) groupByColumns.push('et.name')
        if (hasSubject) groupByColumns.push('et.subject')
        if (hasDescription) groupByColumns.push('et.description')
        if (hasCategory) groupByColumns.push('et.category')
        if (hasTemplateType) groupByColumns.push('et.template_type')
        if (hasUsageCount) groupByColumns.push('et.usage_count')
        if (hasCloneCount) groupByColumns.push('et.clone_count')
        if (hasCreatedAt) groupByColumns.push('et.created_at')
        if (hasUpdatedAt) groupByColumns.push('et.updated_at')
        query = query.groupBy(groupByColumns)
      }

      if (hasUsageCount || hasCloneCount || canJoinRatings) {
        const usageExpr = hasUsageCount ? 'COALESCE(et.usage_count, 0)' : '0'
        const cloneExpr = hasCloneCount ? 'COALESCE(et.clone_count, 0)' : '0'
        const ratingExpr = canJoinRatings ? 'COUNT(tr.template_id) * 2' : '0'
        query = query.orderByRaw(`(${usageExpr} + ${cloneExpr} + ${ratingExpr}) DESC`)
      } else if (hasUpdatedAt) {
        query = query.orderBy('et.updated_at', 'desc')
      } else if (hasCreatedAt) {
        query = query.orderBy('et.created_at', 'desc')
      } else {
        query = query.orderBy('et.id', 'desc')
      }

      const normalizedLimit = Math.min(Math.max(1, Number(limit) || 10), 50)
      const trending = await query.limit(normalizedLimit)

      return trending.map((template: any) => ({
        ...template,
        template_name: template.name || 'Template',
        avg_rating: Number(template.avg_rating || 0),
        rating_count: Number(template.rating_count || 0),
        usage_count: Number(template.usage_count || 0),
        clone_count: Number(template.clone_count || 0)
      }))
    } catch (error) {
      logger.error('Erro ao buscar templates em tendencia (V2):', error)
      return []
    }
  }

  async getAdvancedAnalytics(templateId?: number, userId?: number) {
    try {
      const hasTemplatesTable = await this.hasTable('email_templates')
      if (!hasTemplatesTable) {
        return templateId ? this.buildEmptyTemplateAnalytics() : this.buildEmptyGeneralAnalytics()
      }

      if (templateId) {
        const [hasName, hasCreatedAt, hasUsageCount, hasCloneCount] = await Promise.all([
          this.hasColumn('email_templates', 'name'),
          this.hasColumn('email_templates', 'created_at'),
          this.hasColumn('email_templates', 'usage_count'),
          this.hasColumn('email_templates', 'clone_count')
        ])

        const template: any = await db('email_templates')
          .where('id', templateId)
          .select([
            'id',
            hasName ? 'name' : db.raw("'Template' as name"),
            hasCreatedAt ? 'created_at' : db.raw('CURRENT_TIMESTAMP as created_at'),
            hasUsageCount ? 'usage_count' : db.raw('0 as usage_count'),
            hasCloneCount ? 'clone_count' : db.raw('0 as clone_count')
          ])
          .first()

        const hasRatingsTable = await this.hasTable('template_ratings')
        const [hasRatingsTemplateId, hasRatingsValue, hasRatingsCreatedAt] = hasRatingsTable
          ? await Promise.all([
            this.hasColumn('template_ratings', 'template_id'),
            this.hasColumn('template_ratings', 'rating'),
            this.hasColumn('template_ratings', 'created_at')
          ])
          : [false, false, false]

        const canUseRatings = hasRatingsTable && hasRatingsTemplateId && hasRatingsValue

        const ratings = canUseRatings
          ? await db('template_ratings')
            .where('template_id', templateId)
            .select(
              db.raw('COALESCE(AVG(rating), 0) as avg_rating'),
              db.raw('COUNT(*) as total_ratings'),
              db.raw('COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_ratings')
            )
            .first() as any
          : { avg_rating: 0, total_ratings: 0, positive_ratings: 0 }

        const usageTrend = canUseRatings && hasRatingsCreatedAt
          ? await db('template_ratings')
            .where('template_id', templateId)
            .where('created_at', '>=', db.raw("NOW() - INTERVAL '30 days'"))
            .select(
              db.raw('DATE(created_at) as date'),
              db.raw('COUNT(*) as daily_usage')
            )
            .groupBy(db.raw('DATE(created_at)'))
            .orderBy('date')
          : []

        return {
          template: template
            ? {
              ...template,
              template_name: template.name || 'Template',
              usage_count: Number(template.usage_count || 0),
              clone_count: Number(template.clone_count || 0)
            }
            : null,
          ratings: {
            average: Number(ratings?.avg_rating || 0),
            total: Number(ratings?.total_ratings || 0),
            satisfaction: Number(ratings?.total_ratings || 0) > 0
              ? Math.round((Number(ratings?.positive_ratings || 0) / Number(ratings.total_ratings)) * 100)
              : 0
          },
          usage_trend: usageTrend
        }
      }

      const [hasUserId, hasUsageCount, hasCloneCount, hasCategory, hasIsPublic] = await Promise.all([
        this.hasColumn('email_templates', 'user_id'),
        this.hasColumn('email_templates', 'usage_count'),
        this.hasColumn('email_templates', 'clone_count'),
        this.hasColumn('email_templates', 'category'),
        this.hasColumn('email_templates', 'is_public')
      ])

      if (!hasUserId) {
        return this.buildEmptyGeneralAnalytics()
      }

      const userStatsRow = await db('email_templates')
        .where('user_id', userId || 0)
        .select(
          db.raw('COUNT(*) as total_templates'),
          hasUsageCount ? db.raw('COALESCE(SUM(usage_count), 0) as total_usage') : db.raw('0 as total_usage'),
          hasCloneCount ? db.raw('COALESCE(SUM(clone_count), 0) as total_clones') : db.raw('0 as total_clones')
        )
        .first() as any

      const hasRatingsTable = await this.hasTable('template_ratings')
      const [hasRatingsTemplateId, hasRatingsValue] = hasRatingsTable
        ? await Promise.all([
          this.hasColumn('template_ratings', 'template_id'),
          this.hasColumn('template_ratings', 'rating')
        ])
        : [false, false]
      const canUseRatings = hasRatingsTable && hasRatingsTemplateId && hasRatingsValue

      const publicTemplatesRow = hasIsPublic
        ? await db('email_templates')
          .where('user_id', userId || 0)
          .where('is_public', true)
          .count('* as total')
          .first() as any
        : { total: 0 }

      const ratingsRow = canUseRatings && hasIsPublic
        ? await db('email_templates as et')
          .leftJoin('template_ratings as tr', 'et.id', 'tr.template_id')
          .where('et.user_id', userId || 0)
          .where('et.is_public', true)
          .select(
            db.raw('COALESCE(AVG(tr.rating), 0) as avg_rating'),
            db.raw('COUNT(tr.template_id) as total_ratings')
          )
          .first() as any
        : { avg_rating: 0, total_ratings: 0 }

      const topCategories = hasCategory
        ? await db('email_templates')
          .where('user_id', userId || 0)
          .select('category', db.raw('COUNT(*) as count'))
          .groupBy('category')
          .orderBy('count', 'desc')
          .limit(5)
        : []

      return {
        user_stats: {
          total_templates: Number(userStatsRow?.total_templates || 0),
          total_usage: Number(userStatsRow?.total_usage || 0),
          total_clones: Number(userStatsRow?.total_clones || 0),
          public_templates: Number(publicTemplatesRow?.total || 0),
          avg_rating: Number(ratingsRow?.avg_rating || 0),
          total_ratings: Number(ratingsRow?.total_ratings || 0)
        },
        top_categories: topCategories.map((item: any) => ({
          category: item.category || 'general',
          count: Number(item.count || 0)
        }))
      }
    } catch (error) {
      logger.error('Erro ao buscar analytics (V2):', error)
      return templateId ? this.buildEmptyTemplateAnalytics() : this.buildEmptyGeneralAnalytics()
    }
  }

  exportTemplates(...args: any[]) {
    return (LegacySharedTemplateService as any).exportTemplates(...args)
  }

  importTemplates(...args: any[]) {
    return (LegacySharedTemplateService as any).importTemplates(...args)
  }
}

export default new SharedTemplateServiceV2()
