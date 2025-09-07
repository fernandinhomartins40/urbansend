const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');
const { z } = require('zod');
const { TrendAnalyticsService } = require('../services/TrendAnalyticsService');

const router = Router();
router.use(authenticateJWT);

// Schemas de validação
const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  granularity: z.enum(['hourly', 'daily', 'weekly', 'monthly']).default('daily'),
  domainId: z.coerce.number().int().positive().optional()
});

const comparativeSchema = z.object({
  currentStartDate: z.string().datetime(),
  currentEndDate: z.string().datetime(),
  previousStartDate: z.string().datetime(),
  previousEndDate: z.string().datetime()
});

// GET /trend-analytics/sends - Dados de tendência de envios
router.get('/sends',
  validateRequest({ query: dateRangeSchema }),
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    const data = await trendAnalytics.getSendsTrendData(req.user.id, req.query);
    
    res.json({
      success: true,
      data: {
        sends: data,
        metadata: {
          userId: req.user.id,
          dateRange: {
            start: req.query.startDate,
            end: req.query.endDate
          },
          granularity: req.query.granularity || 'daily',
          totalPeriods: data.length,
          totalEmails: data.reduce((sum, period) => sum + period.total_emails, 0)
        }
      }
    });
  })
);

// GET /trend-analytics/domains - Performance por domínio
router.get('/domains',
  validateRequest({ query: dateRangeSchema.omit({ granularity: true, domainId: true }) }),
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    const data = await trendAnalytics.getDomainPerformanceData(req.user.id, req.query);
    
    res.json({
      success: true,
      data: {
        domains: data,
        metadata: {
          userId: req.user.id,
          dateRange: {
            start: req.query.startDate,
            end: req.query.endDate
          },
          totalDomains: data.length,
          activeDomains: data.filter(d => d.total_emails > 0).length
        }
      }
    });
  })
);

// GET /trend-analytics/hourly-engagement - Engajamento por hora
router.get('/hourly-engagement',
  validateRequest({ query: dateRangeSchema.omit({ granularity: true, domainId: true }) }),
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    const data = await trendAnalytics.getHourlyEngagementData(req.user.id, req.query);
    
    // Encontrar horários de maior engajamento
    const bestHours = data
      .filter(hour => hour.total_emails > 0)
      .sort((a, b) => b.engagement_score - a.engagement_score)
      .slice(0, 3)
      .map(hour => ({
        hour: hour.hour,
        engagement_score: hour.engagement_score,
        open_rate: hour.open_rate,
        click_rate: hour.click_rate
      }));
    
    res.json({
      success: true,
      data: {
        hourly: data,
        insights: {
          best_hours: bestHours,
          peak_hour: bestHours[0] || null,
          total_hours_with_activity: data.filter(h => h.total_emails > 0).length
        },
        metadata: {
          userId: req.user.id,
          dateRange: {
            start: req.query.startDate,
            end: req.query.endDate
          }
        }
      }
    });
  })
);

// GET /trend-analytics/weekly-engagement - Engajamento por dia da semana
router.get('/weekly-engagement',
  validateRequest({ query: dateRangeSchema.omit({ granularity: true, domainId: true }) }),
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    const data = await trendAnalytics.getDayOfWeekEngagementData(req.user.id, req.query);
    
    // Encontrar melhores dias
    const bestDays = data
      .filter(day => day.total_emails > 0)
      .sort((a, b) => b.engagement_score - a.engagement_score)
      .slice(0, 3)
      .map(day => ({
        day_name: day.day_name,
        engagement_score: day.engagement_score,
        open_rate: day.open_rate,
        click_rate: day.click_rate
      }));
    
    res.json({
      success: true,
      data: {
        weekly: data,
        insights: {
          best_days: bestDays,
          peak_day: bestDays[0] || null,
          total_active_days: data.filter(d => d.total_emails > 0).length
        },
        metadata: {
          userId: req.user.id,
          dateRange: {
            start: req.query.startDate,
            end: req.query.endDate
          }
        }
      }
    });
  })
);

// GET /trend-analytics/comparative - Análise comparativa entre períodos
router.get('/comparative',
  validateRequest({ query: comparativeSchema }),
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    const data = await trendAnalytics.getComparativeAnalytics(req.user.id, req.query);
    
    // Adicionar insights sobre as mudanças
    const insights = {
      performance_trend: data.changes.delivery_rate >= 0 ? 'improving' : 'declining',
      engagement_trend: 
        (data.changes.open_rate + data.changes.click_rate) / 2 >= 0 ? 'improving' : 'declining',
      volume_trend: data.changes.total_emails >= 0 ? 'increasing' : 'decreasing',
      most_improved_metric: Object.entries(data.changes)
        .filter(([key]) => !key.includes('rate') || key === 'delivery_rate')
        .sort(([, a], [, b]) => b - a)[0],
      most_declined_metric: Object.entries(data.changes)
        .filter(([key]) => !key.includes('rate') || key === 'delivery_rate')
        .sort(([, a], [, b]) => a - b)[0]
    };
    
    res.json({
      success: true,
      data: {
        ...data,
        insights,
        metadata: {
          userId: req.user.id,
          periods: {
            current: {
              start: req.query.currentStartDate,
              end: req.query.currentEndDate
            },
            previous: {
              start: req.query.previousStartDate,
              end: req.query.previousEndDate
            }
          }
        }
      }
    });
  })
);

// GET /trend-analytics/dashboard-summary - Resumo para o dashboard
router.get('/dashboard-summary',
  asyncHandler(async (req, res) => {
    const trendAnalytics = new TrendAnalyticsService();
    
    // Obter dados dos últimos 7 e 30 dias
    const last7Days = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    };
    
    const last30Days = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString()
    };
    
    const [
      weeklyTrend,
      monthlyTrend,
      domainPerformance,
      hourlyEngagement
    ] = await Promise.all([
      trendAnalytics.getSendsTrendData(req.user.id, { ...last7Days, granularity: 'daily' }),
      trendAnalytics.getSendsTrendData(req.user.id, { ...last30Days, granularity: 'daily' }),
      trendAnalytics.getDomainPerformanceData(req.user.id, last7Days),
      trendAnalytics.getHourlyEngagementData(req.user.id, last7Days)
    ]);
    
    // Calcular totais e tendências
    const weeklyTotals = weeklyTrend.reduce((acc, day) => {
      acc.total_emails += day.total_emails;
      acc.delivered_emails += day.delivered_emails;
      acc.bounced_emails += day.bounced_emails;
      return acc;
    }, { total_emails: 0, delivered_emails: 0, bounced_emails: 0 });
    
    const topDomain = domainPerformance
      .sort((a, b) => b.total_emails - a.total_emails)[0] || null;
    
    const peakHour = hourlyEngagement
      .filter(h => h.total_emails > 0)
      .sort((a, b) => b.engagement_score - a.engagement_score)[0] || null;
    
    res.json({
      success: true,
      data: {
        summary: {
          period: '7 days',
          total_emails: weeklyTotals.total_emails,
          delivery_rate: weeklyTotals.total_emails > 0 ? 
            Math.round((weeklyTotals.delivered_emails / weeklyTotals.total_emails) * 100 * 100) / 100 : 0,
          bounce_rate: weeklyTotals.total_emails > 0 ? 
            Math.round((weeklyTotals.bounced_emails / weeklyTotals.total_emails) * 100 * 100) / 100 : 0
        },
        trends: {
          weekly: weeklyTrend,
          monthly: monthlyTrend.slice(-7) // Últimos 7 dias do período de 30 dias
        },
        insights: {
          top_domain: topDomain,
          peak_hour: peakHour,
          active_domains: domainPerformance.filter(d => d.total_emails > 0).length,
          active_hours: hourlyEngagement.filter(h => h.total_emails > 0).length
        },
        metadata: {
          userId: req.user.id,
          generated_at: new Date().toISOString(),
          data_freshness: 'real-time'
        }
      }
    });
  })
);

module.exports = router;