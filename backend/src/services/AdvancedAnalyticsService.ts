/**
 * AdvancedAnalyticsService - Sistema Avançado de Analytics com Segmentação
 * 
 * FUNCIONALIDADES:
 * - Segmentação inteligente de emails
 * - Analytics geográficos e demográficos
 * - Análise de dispositivos e clientes
 * - Funis de conversão
 * - Insights automáticos com IA
 * - Benchmarks da indústria
 * - Relatórios personalizados
 */

import db from '../config/database'
import { logger } from '../config/logger'

interface SegmentFilters {
  domain_contains?: string[]
  email_status?: string[]
  device_type?: string[]
  country?: string[]
  engagement_score?: { min?: number, max?: number }
  time_range?: { start: Date, end: Date }
  custom_conditions?: any[]
}

interface AnalyticsQuery {
  user_id: number
  segment_ids?: number[]
  period_start: Date
  period_end: Date
  metrics?: string[]
  group_by?: string[]
  filters?: any
}

interface InsightConfig {
  type: string
  threshold?: number
  confidence_min?: number
  priority?: 'low' | 'medium' | 'high' | 'critical'
}

export class AdvancedAnalyticsService {
  private static instance: AdvancedAnalyticsService
  private cache = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutos

  public static getInstance(): AdvancedAnalyticsService {
    if (!AdvancedAnalyticsService.instance) {
      AdvancedAnalyticsService.instance = new AdvancedAnalyticsService()
    }
    return AdvancedAnalyticsService.instance
  }

  /**
   * === GERENCIAMENTO DE SEGMENTOS ===
   */

  /**
   * Criar segmento avançado
   */
  async createSegment(userId: number, name: string, description: string, filters: SegmentFilters, isSmart: boolean = false) {
    try {
      const [segmentId] = await db('email_segments').insert({
        user_id: userId,
        name,
        description,
        filters: JSON.stringify(filters),
        is_smart: isSmart,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })

      // Calcular emails do segmento imediatamente
      await this.calculateSegmentEmails(segmentId)

      const segment = await db('email_segments').where('id', segmentId).first()

      logger.info('Segmento criado:', {
        segmentId,
        userId,
        name,
        isSmart,
        emailCount: segment.total_emails
      })

      return segment

    } catch (error) {
      logger.error('Erro ao criar segmento:', error)
      throw new Error('Falha ao criar segmento')
    }
  }

  /**
   * Calcular emails que correspondem a um segmento
   */
  async calculateSegmentEmails(segmentId: number) {
    try {
      const segment = await db('email_segments').where('id', segmentId).first()
      if (!segment) throw new Error('Segmento não encontrado')

      const filters = JSON.parse(segment.filters)
      let query = db('emails').where('user_id', segment.user_id)

      // Aplicar filtros do segmento
      if (filters.email_status && filters.email_status.length > 0) {
        query = query.whereIn('status', filters.email_status)
      }

      if (filters.domain_contains && filters.domain_contains.length > 0) {
        query = query.where(function() {
          filters.domain_contains.forEach((domain: string, index: number) => {
            if (index === 0) {
              this.where('to_email', 'like', `%${domain}%`)
            } else {
              this.orWhere('to_email', 'like', `%${domain}%`)
            }
          })
        })
      }

      if (filters.time_range) {
        query = query.whereBetween('created_at', [filters.time_range.start, filters.time_range.end])
      }

      const emailIds = await query.pluck('id')

      // Se há filtros de analytics (dispositivo, país, etc.), filtrar pelos emails que têm analytics
      if (filters.device_type || filters.country || filters.engagement_score) {
        let analyticsQuery = db('email_analytics')
          .whereIn('email_id', emailIds)
          .distinct('email_id')

        if (filters.device_type && filters.device_type.length > 0) {
          analyticsQuery = analyticsQuery.whereIn('device_type', filters.device_type)
        }

        if (filters.country && filters.country.length > 0) {
          analyticsQuery = analyticsQuery.whereIn('geographic_data', filters.country)
        }

        // TODO: Implementar filtro por engagement score

        const filteredEmailIds = await analyticsQuery.pluck('email_id')
        
        // Inserir emails no segmento
        for (const emailId of filteredEmailIds) {
          await this.addEmailToSegmentAnalytics(segment.user_id, segmentId, emailId)
        }

        await db('email_segments')
          .where('id', segmentId)
          .update({
            total_emails: filteredEmailIds.length,
            last_calculated_at: new Date(),
            updated_at: new Date()
          })

        return filteredEmailIds.length
      }

      // Para segmentos sem filtros de analytics, apenas contar
      await db('email_segments')
        .where('id', segmentId)
        .update({
          total_emails: emailIds.length,
          last_calculated_at: new Date(),
          updated_at: new Date()
        })

      return emailIds.length

    } catch (error) {
      logger.error('Erro ao calcular segmento:', error)
      throw error
    }
  }

  /**
   * Adicionar email aos analytics de segmento
   */
  private async addEmailToSegmentAnalytics(userId: number, segmentId: number, emailId: number) {
    try {
      // Buscar dados do email e suas analytics
      const email = await db('emails').where('id', emailId).first()
      if (!email) return

      const analytics = await db('email_analytics')
        .where('email_id', emailId)
        .select('*')

      // Para cada evento de analytics, criar entrada no segmento
      for (const analytic of analytics) {
        await db('email_segment_analytics').insert({
          user_id: userId,
          segment_id: segmentId,
          email_id: emailId,
          event_type: analytic.event_type,
          recipient_country: this.extractCountryFromGeoData(analytic.geographic_data),
          recipient_region: this.extractRegionFromGeoData(analytic.geographic_data),
          recipient_city: this.extractCityFromGeoData(analytic.geographic_data),
          device_type: analytic.device_type,
          device_brand: analytic.device_brand,
          os_name: analytic.device_info ? JSON.parse(analytic.device_info)?.os : null,
          browser_name: analytic.device_info ? JSON.parse(analytic.device_info)?.browser : null,
          email_client: analytic.client_info ? JSON.parse(analytic.client_info)?.client : null,
          hour_of_day: new Date(analytic.created_at).getHours(),
          day_of_week: new Date(analytic.created_at).getDay(),
          week_of_year: this.getWeekOfYear(new Date(analytic.created_at)),
          month: new Date(analytic.created_at).getMonth() + 1,
          quarter: Math.ceil((new Date(analytic.created_at).getMonth() + 1) / 3),
          engagement_duration_seconds: analytic.engagement_score * 10, // Estimativa
          user_agent: analytic.client_info,
          created_at: analytic.created_at
        })
      }

    } catch (error) {
      logger.error('Erro ao adicionar email ao segmento analytics:', error)
    }
  }

  /**
   * === ANALYTICS AVANÇADOS ===
   */

  /**
   * Obter analytics consolidados por segmento
   */
  async getSegmentAnalytics(userId: number, segmentId?: number, periodDays: number = 30) {
    try {
      const cacheKey = `segment_analytics:${userId}:${segmentId || 'all'}:${periodDays}`
      
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)
        if (Date.now() - cached.timestamp < this.CACHE_TTL) {
          return cached.data
        }
      }

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - periodDays)

      let query = db('view_segment_analytics_summary').where('user_id', userId)
      
      if (segmentId) {
        query = query.where('segment_id', segmentId)
      }

      const analytics = await query

      // Buscar dados temporais
      const temporalData = await this.getTemporalAnalytics(userId, segmentId, startDate, endDate)
      
      // Buscar dados geográficos
      const geoData = await this.getGeographicAnalytics(userId, segmentId, startDate, endDate)
      
      // Buscar dados de dispositivos
      const deviceData = await this.getDeviceAnalytics(userId, segmentId, startDate, endDate)

      const result = {
        segments: analytics,
        temporal: temporalData,
        geographic: geoData,
        devices: deviceData,
        period: { start: startDate, end: endDate }
      }

      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      return result

    } catch (error) {
      logger.error('Erro ao obter analytics de segmento:', error)
      throw new Error('Falha ao carregar analytics')
    }
  }

  /**
   * Analytics temporais (horas, dias, meses)
   */
  private async getTemporalAnalytics(userId: number, segmentId?: number, startDate?: Date, endDate?: Date) {
    let query = db('email_segment_analytics')
      .where('user_id', userId)

    if (segmentId) {
      query = query.where('segment_id', segmentId)
    }

    if (startDate && endDate) {
      query = query.whereBetween('created_at', [startDate, endDate])
    }

    const [hourlyData, dailyData, monthlyData] = await Promise.all([
      // Dados por hora do dia
      query.clone()
        .select('hour_of_day')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .groupBy('hour_of_day')
        .orderBy('hour_of_day'),
      
      // Dados por dia da semana
      query.clone()
        .select('day_of_week')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .groupBy('day_of_week')
        .orderBy('day_of_week'),
      
      // Dados por mês
      query.clone()
        .select('month')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .groupBy('month')
        .orderBy('month')
    ])

    return {
      hourly: hourlyData,
      daily: dailyData,
      monthly: monthlyData
    }
  }

  /**
   * Analytics geográficos
   */
  private async getGeographicAnalytics(userId: number, segmentId?: number, startDate?: Date, endDate?: Date) {
    let query = db('email_segment_analytics')
      .where('user_id', userId)
      .whereNotNull('recipient_country')

    if (segmentId) {
      query = query.where('segment_id', segmentId)
    }

    if (startDate && endDate) {
      query = query.whereBetween('created_at', [startDate, endDate])
    }

    const [countryData, regionData] = await Promise.all([
      // Dados por país
      query.clone()
        .select('recipient_country as country')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .avg('engagement_duration_seconds as avg_engagement')
        .groupBy('recipient_country')
        .orderBy('total_events', 'desc')
        .limit(20),
      
      // Dados por região/estado
      query.clone()
        .select('recipient_region as region', 'recipient_country as country')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .groupBy('recipient_region', 'recipient_country')
        .orderBy('total_events', 'desc')
        .limit(50)
    ])

    return {
      countries: countryData,
      regions: regionData
    }
  }

  /**
   * Analytics de dispositivos
   */
  private async getDeviceAnalytics(userId: number, segmentId?: number, startDate?: Date, endDate?: Date) {
    let query = db('email_segment_analytics')
      .where('user_id', userId)
      .whereNotNull('device_type')

    if (segmentId) {
      query = query.where('segment_id', segmentId)
    }

    if (startDate && endDate) {
      query = query.whereBetween('created_at', [startDate, endDate])
    }

    const [deviceTypes, browsers, operatingSystems, emailClients] = await Promise.all([
      // Tipos de dispositivo
      query.clone()
        .select('device_type')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .avg('engagement_duration_seconds as avg_engagement')
        .groupBy('device_type')
        .orderBy('total_events', 'desc'),
      
      // Navegadores
      query.clone()
        .select('browser_name')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .whereNotNull('browser_name')
        .groupBy('browser_name')
        .orderBy('total_events', 'desc')
        .limit(10),
      
      // Sistemas operacionais
      query.clone()
        .select('os_name')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .whereNotNull('os_name')
        .groupBy('os_name')
        .orderBy('total_events', 'desc')
        .limit(10),
      
      // Clientes de email
      query.clone()
        .select('email_client')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .whereNotNull('email_client')
        .groupBy('email_client')
        .orderBy('total_events', 'desc')
        .limit(10)
    ])

    return {
      device_types: deviceTypes,
      browsers,
      operating_systems: operatingSystems,
      email_clients: emailClients
    }
  }

  /**
   * === INSIGHTS AUTOMÁTICOS ===
   */

  /**
   * Gerar insights automáticos baseados nos dados
   */
  async generateInsights(userId: number, segmentId?: number) {
    try {
      const insights = []

      // Insight de performance vs benchmark
      const performanceInsight = await this.generatePerformanceInsight(userId, segmentId)
      if (performanceInsight) insights.push(performanceInsight)

      // Insight de melhor horário
      const timingInsight = await this.generateTimingInsight(userId, segmentId)
      if (timingInsight) insights.push(timingInsight)

      // Insight geográfico
      const geoInsight = await this.generateGeographicInsight(userId, segmentId)
      if (geoInsight) insights.push(geoInsight)

      // Insight de dispositivo
      const deviceInsight = await this.generateDeviceInsight(userId, segmentId)
      if (deviceInsight) insights.push(deviceInsight)

      // Salvar insights no banco
      for (const insight of insights) {
        await this.saveInsight(userId, insight)
      }

      return insights

    } catch (error) {
      logger.error('Erro ao gerar insights:', error)
      throw error
    }
  }

  /**
   * Insight de performance comparado ao benchmark
   */
  private async generatePerformanceInsight(userId: number, segmentId?: number) {
    try {
      // Obter métricas do usuário
      const userMetrics = await this.getUserMetrics(userId, segmentId)
      if (!userMetrics) return null

      // Obter benchmark da indústria (assumindo 'general' se não especificado)
      const benchmarks = await db('industry_benchmarks')
        .where('industry', 'general')
        .whereIn('metric_name', ['open_rate', 'click_rate'])

      const openBenchmark = benchmarks.find(b => b.metric_name === 'open_rate')
      const clickBenchmark = benchmarks.find(b => b.metric_name === 'click_rate')

      if (!openBenchmark || !clickBenchmark) return null

      const userOpenRate = userMetrics.open_rate || 0
      const userClickRate = userMetrics.click_rate || 0

      // Calcular diferença percentual
      const openDiff = ((userOpenRate - openBenchmark.metric_value) / openBenchmark.metric_value) * 100
      const clickDiff = ((userClickRate - clickBenchmark.metric_value) / clickBenchmark.metric_value) * 100

      if (Math.abs(openDiff) > 20 || Math.abs(clickDiff) > 20) {
        return {
          type: openDiff > 0 || clickDiff > 0 ? 'performance_above_benchmark' : 'performance_below_benchmark',
          title: openDiff > 0 || clickDiff > 0 ? 
            'Performance acima do mercado' : 
            'Oportunidade de melhoria detectada',
          description: `Sua taxa de abertura (${userOpenRate.toFixed(1)}%) está ${Math.abs(openDiff).toFixed(1)}% ${openDiff > 0 ? 'acima' : 'abaixo'} do mercado. Taxa de cliques (${userClickRate.toFixed(1)}%) está ${Math.abs(clickDiff).toFixed(1)}% ${clickDiff > 0 ? 'acima' : 'abaixo'} do mercado.`,
          impact_score: Math.min(Math.max(Math.abs(openDiff) + Math.abs(clickDiff), 20), 100),
          confidence_level: 85.0,
          baseline_metric: openBenchmark.metric_value,
          current_metric: userOpenRate,
          improvement_percentage: openDiff
        }
      }

      return null

    } catch (error) {
      logger.error('Erro ao gerar insight de performance:', error)
      return null
    }
  }

  /**
   * Insight de melhor horário para envio
   */
  private async generateTimingInsight(userId: number, segmentId?: number) {
    try {
      let query = db('email_segment_analytics')
        .where('user_id', userId)
        .whereIn('event_type', ['opened', 'clicked'])

      if (segmentId) {
        query = query.where('segment_id', segmentId)
      }

      const hourlyStats = await query
        .select('hour_of_day')
        .count('* as total_events')
        .count(db.raw("CASE WHEN event_type = 'opened' THEN 1 END as opens"))
        .count(db.raw("CASE WHEN event_type = 'clicked' THEN 1 END as clicks"))
        .groupBy('hour_of_day')
        .having('total_events', '>', 10) // Mínimo de eventos para ser relevante

      if (hourlyStats.length === 0) return null

      // Encontrar horário com melhor engajamento
      const bestHour = hourlyStats.reduce((best, current) => {
        const currentRate = (current.opens + current.clicks) / current.total_events
        const bestRate = (best.opens + best.clicks) / best.total_events
        return currentRate > bestRate ? current : best
      })

      const bestEngagementRate = ((bestHour.opens + bestHour.clicks) / bestHour.total_events) * 100
      const avgEngagementRate = hourlyStats.reduce((sum, hour) => {
        return sum + ((hour.opens + hour.clicks) / hour.total_events)
      }, 0) / hourlyStats.length * 100

      if (bestEngagementRate > avgEngagementRate * 1.5) {
        return {
          type: 'optimal_send_time',
          title: 'Horário ideal identificado',
          description: `Emails enviados às ${bestHour.hour_of_day}h têm ${(bestEngagementRate - avgEngagementRate).toFixed(1)}% mais engajamento que a média.`,
          impact_score: Math.min((bestEngagementRate - avgEngagementRate) * 2, 100),
          confidence_level: 78.0,
          recommended_actions: JSON.stringify([
            `Agendar emails para ${bestHour.hour_of_day}h`,
            'Testar horários próximos',
            'Considerar fuso horário da audiência'
          ])
        }
      }

      return null

    } catch (error) {
      logger.error('Erro ao gerar insight de timing:', error)
      return null
    }
  }

  /**
   * Insight geográfico
   */
  private async generateGeographicInsight(userId: number, segmentId?: number) {
    try {
      const geoData = await this.getGeographicAnalytics(userId, segmentId)
      
      if (geoData.countries.length === 0) return null

      const topCountry = geoData.countries[0]
      const totalEvents = geoData.countries.reduce((sum, country) => sum + country.total_events, 0)

      if (topCountry.total_events / totalEvents > 0.6) {
        return {
          type: 'geographic_concentration',
          title: 'Concentração geográfica alta',
          description: `${((topCountry.total_events / totalEvents) * 100).toFixed(1)}% dos seus emails são para ${topCountry.country}. Considere estratégias específicas para esta região.`,
          impact_score: 60,
          confidence_level: 90.0
        }
      }

      return null

    } catch (error) {
      logger.error('Erro ao gerar insight geográfico:', error)
      return null
    }
  }

  /**
   * Insight de dispositivo
   */
  private async generateDeviceInsight(userId: number, segmentId?: number) {
    try {
      const deviceData = await this.getDeviceAnalytics(userId, segmentId)
      
      if (deviceData.device_types.length === 0) return null

      const mobileData = deviceData.device_types.find(d => d.device_type === 'mobile')
      const desktopData = deviceData.device_types.find(d => d.device_type === 'desktop')

      if (mobileData && desktopData) {
        const mobileEngagement = (mobileData.opens + mobileData.clicks) / mobileData.total_events
        const desktopEngagement = (desktopData.opens + desktopData.clicks) / desktopData.total_events
        
        if (Math.abs(mobileEngagement - desktopEngagement) > 0.15) {
          const better = mobileEngagement > desktopEngagement ? 'mobile' : 'desktop'
          const betterRate = better === 'mobile' ? mobileEngagement : desktopEngagement
          const worseRate = better === 'mobile' ? desktopEngagement : mobileEngagement
          
          return {
            type: 'device_performance_gap',
            title: `Performance em ${better} superior`,
            description: `Emails abertos em ${better} têm ${((betterRate - worseRate) * 100).toFixed(1)}% mais engajamento. Otimize templates para este dispositivo.`,
            impact_score: Math.min(((betterRate - worseRate) * 200), 100),
            confidence_level: 82.0
          }
        }
      }

      return null

    } catch (error) {
      logger.error('Erro ao gerar insight de dispositivo:', error)
      return null
    }
  }

  /**
   * Salvar insight no banco
   */
  private async saveInsight(userId: number, insight: any) {
    try {
      // Verificar se insight similar já existe
      const existing = await db('analytics_insights')
        .where('user_id', userId)
        .where('insight_type', insight.type)
        .where('status', 'active')
        .where('created_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Últimos 7 dias
        .first()

      if (existing) {
        // Atualizar insight existente
        await db('analytics_insights')
          .where('id', existing.id)
          .update({
            description: insight.description,
            impact_score: insight.impact_score,
            confidence_level: insight.confidence_level,
            current_metric: insight.current_metric,
            updated_at: new Date()
          })
      } else {
        // Criar novo insight
        await db('analytics_insights').insert({
          user_id: userId,
          insight_type: insight.type,
          title: insight.title,
          description: insight.description,
          impact_score: insight.impact_score || 50,
          confidence_level: insight.confidence_level || 75.0,
          recommended_actions: insight.recommended_actions,
          baseline_metric: insight.baseline_metric,
          current_metric: insight.current_metric,
          improvement_percentage: insight.improvement_percentage,
          priority: this.calculatePriority(insight.impact_score),
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        })
      }

    } catch (error) {
      logger.error('Erro ao salvar insight:', error)
    }
  }

  /**
   * === UTILITÁRIOS ===
   */

  /**
   * Obter métricas básicas do usuário
   */
  private async getUserMetrics(userId: number, segmentId?: number) {
    try {
      let query = db('email_segment_analytics')
        .where('user_id', userId)

      if (segmentId) {
        query = query.where('segment_id', segmentId)
      }

      const metrics = await query
        .select(
          db.raw("COUNT(CASE WHEN event_type = 'sent' THEN 1 END) as sent_count"),
          db.raw("COUNT(CASE WHEN event_type = 'delivered' THEN 1 END) as delivered_count"),
          db.raw("COUNT(CASE WHEN event_type = 'opened' THEN 1 END) as opened_count"),
          db.raw("COUNT(CASE WHEN event_type = 'clicked' THEN 1 END) as clicked_count"),
          db.raw("COUNT(CASE WHEN event_type = 'bounced' THEN 1 END) as bounced_count")
        )
        .first() as any

      if (!metrics || Number(metrics.delivered_count) === 0) return null

      return {
        ...metrics,
        open_rate: (Number(metrics.opened_count) / Number(metrics.delivered_count)) * 100,
        click_rate: (Number(metrics.clicked_count) / Number(metrics.delivered_count)) * 100,
        bounce_rate: (Number(metrics.bounced_count) / Number(metrics.sent_count)) * 100
      }

    } catch (error) {
      logger.error('Erro ao obter métricas:', error)
      return null
    }
  }

  /**
   * Calcular prioridade do insight
   */
  private calculatePriority(impactScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (impactScore >= 80) return 'critical'
    if (impactScore >= 60) return 'high'
    if (impactScore >= 30) return 'medium'
    return 'low'
  }

  /**
   * Extrair país dos dados geográficos
   */
  private extractCountryFromGeoData(geoData: string): string | null {
    if (!geoData) return null
    try {
      const parsed = JSON.parse(geoData)
      return parsed.country || null
    } catch {
      return null
    }
  }

  /**
   * Extrair região dos dados geográficos
   */
  private extractRegionFromGeoData(geoData: string): string | null {
    if (!geoData) return null
    try {
      const parsed = JSON.parse(geoData)
      return parsed.region || parsed.state || null
    } catch {
      return null
    }
  }

  /**
   * Extrair cidade dos dados geográficos
   */
  private extractCityFromGeoData(geoData: string): string | null {
    if (!geoData) return null
    try {
      const parsed = JSON.parse(geoData)
      return parsed.city || null
    } catch {
      return null
    }
  }

  /**
   * Obter semana do ano
   */
  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1)
    const diff = date.getTime() - start.getTime()
    return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))
  }

  /**
   * Limpar cache
   */
  public clearCache() {
    this.cache.clear()
  }
}

export default AdvancedAnalyticsService.getInstance()