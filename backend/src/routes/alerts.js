const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');
const { z } = require('zod');
const { AlertsService } = require('../services/AlertsService');
const db = require('../config/database');

const router = Router();
router.use(authenticateJWT);

// Schemas de validação
const alertsQuerySchema = z.object({
  includeResolved: z.coerce.boolean().default(false),
  severity: z.enum(['critical', 'warning', 'info', 'low']).optional(),
  type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1)
});

const resolveAlertSchema = z.object({
  resolvedBy: z.string().optional().default('user')
});

const alertSettingsSchema = z.object({
  alerts_enabled: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  push_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
  notification_email: z.string().email().optional().nullable(),
  notification_phone: z.string().optional().nullable(),
  webhook_url: z.string().url().optional().nullable(),
  max_alerts_per_hour: z.number().int().min(1).max(100).optional(),
  max_alerts_per_day: z.number().int().min(1).max(500).optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  timezone: z.string().optional()
});

// GET /alerts - Obter alertas ativos
router.get('/',
  validateRequest({ query: alertsQuerySchema }),
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    const { page, limit, ...options } = req.query;
    
    const alerts = await alertsService.getActiveAlerts(req.user.id, {
      ...options,
      limit: limit * page // Simular paginação simples
    });
    
    // Aplicar paginação manual se necessário
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAlerts = alerts.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        alerts: paginatedAlerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: alerts.length,
          pages: Math.ceil(alerts.length / limit),
          hasMore: endIndex < alerts.length
        },
        metadata: {
          userId: req.user.id,
          filters: options,
          total_active: alerts.filter(a => a.status === 'active').length,
          by_severity: {
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length,
            low: alerts.filter(a => a.severity === 'low').length
          }
        }
      }
    });
  })
);

// POST /alerts/refresh - Gerar/atualizar alertas do sistema
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    await alertsService.generateSystemAlerts(req.user.id);
    
    // Retornar alertas atualizados
    const alerts = await alertsService.getActiveAlerts(req.user.id, { limit: 20 });
    
    res.json({
      success: true,
      data: {
        alerts,
        refreshed_at: new Date().toISOString(),
        message: 'Alertas do sistema atualizados com sucesso'
      }
    });
  })
);

// PUT /alerts/:id/resolve - Resolver alerta específico
router.put('/:id/resolve',
  validateRequest({ body: resolveAlertSchema }),
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    const alertId = parseInt(req.params.id);
    const { resolvedBy } = req.body;
    
    const resolved = await alertsService.resolveAlert(req.user.id, alertId, resolvedBy);
    
    if (!resolved) {
      return res.status(404).json({
        success: false,
        message: 'Alerta não encontrado ou já resolvido'
      });
    }
    
    res.json({
      success: true,
      message: 'Alerta resolvido com sucesso',
      data: {
        alert_id: alertId,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString()
      }
    });
  })
);

// POST /alerts/resolve-multiple - Resolver múltiplos alertas
router.post('/resolve-multiple',
  validateRequest({
    body: z.object({
      alert_ids: z.array(z.number().int().positive()),
      resolvedBy: z.string().optional().default('user')
    })
  }),
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    const { alert_ids, resolvedBy } = req.body;
    
    const results = await Promise.allSettled(
      alert_ids.map(alertId => 
        alertsService.resolveAlert(req.user.id, alertId, resolvedBy)
      )
    );
    
    const resolved = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failed = results.length - resolved;
    
    res.json({
      success: true,
      message: `${resolved} alertas resolvidos, ${failed} falharam`,
      data: {
        total_requested: alert_ids.length,
        resolved_count: resolved,
        failed_count: failed,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString()
      }
    });
  })
);

// GET /alerts/stats - Estatísticas de alertas
router.get('/stats',
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    const stats = await alertsService.getAlertsStats(req.user.id);
    
    // Adicionar informações complementares
    const alerts = await alertsService.getActiveAlerts(req.user.id, { limit: 1000 });
    
    const recentAlerts = alerts
      .filter(a => new Date(a.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000))
      .length;
    
    const oldestAlert = alerts
      .filter(a => a.status === 'active')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    
    const alertsByType = alerts.reduce((acc, alert) => {
      acc[alert.alert_type] = (acc[alert.alert_type] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        ...stats,
        recent_alerts_24h: recentAlerts,
        oldest_active_alert: oldestAlert ? {
          id: oldestAlert.id,
          type: oldestAlert.alert_type,
          created_at: oldestAlert.created_at,
          age_hours: Math.round((new Date() - new Date(oldestAlert.created_at)) / (1000 * 60 * 60))
        } : null,
        alerts_by_type: alertsByType,
        health_score: this.calculateHealthScore(stats),
        metadata: {
          userId: req.user.id,
          generated_at: new Date().toISOString()
        }
      }
    });
  })
);

// GET /alerts/settings - Obter configurações de alertas do usuário
router.get('/settings',
  asyncHandler(async (req, res) => {
    const settings = await db('user_alert_settings')
      .where('user_id', req.user.id)
      .first();
    
    if (!settings) {
      // Criar configurações padrão se não existirem
      const defaultSettings = {
        user_id: req.user.id,
        alerts_enabled: true,
        email_notifications: true,
        push_notifications: true,
        sms_notifications: false,
        timezone: 'America/Sao_Paulo',
        max_alerts_per_hour: 10,
        max_alerts_per_day: 50,
        digest_frequency_hours: 24,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db('user_alert_settings').insert(defaultSettings);
      
      return res.json({
        success: true,
        data: defaultSettings
      });
    }
    
    // Parse JSON fields
    if (settings.severity_settings) {
      settings.severity_settings = JSON.parse(settings.severity_settings);
    }
    
    if (settings.alert_type_settings) {
      settings.alert_type_settings = JSON.parse(settings.alert_type_settings);
    }
    
    if (settings.quiet_days) {
      settings.quiet_days = JSON.parse(settings.quiet_days);
    }
    
    res.json({
      success: true,
      data: settings
    });
  })
);

// PUT /alerts/settings - Atualizar configurações de alertas
router.put('/settings',
  validateRequest({ body: alertSettingsSchema }),
  asyncHandler(async (req, res) => {
    const updates = {
      ...req.body,
      updated_at: new Date()
    };
    
    // Verificar se já existem configurações
    const existing = await db('user_alert_settings')
      .where('user_id', req.user.id)
      .first();
    
    if (existing) {
      await db('user_alert_settings')
        .where('user_id', req.user.id)
        .update(updates);
    } else {
      await db('user_alert_settings').insert({
        user_id: req.user.id,
        ...updates,
        created_at: new Date()
      });
    }
    
    res.json({
      success: true,
      message: 'Configurações de alertas atualizadas com sucesso',
      data: {
        updated_fields: Object.keys(req.body),
        updated_at: updates.updated_at
      }
    });
  })
);

// GET /alerts/types - Obter tipos de alertas disponíveis
router.get('/types',
  asyncHandler(async (req, res) => {
    const alertsService = new AlertsService();
    
    res.json({
      success: true,
      data: {
        alert_types: alertsService.alertTypes,
        severities: [
          {
            value: 'critical',
            label: 'Crítico',
            description: 'Requer ação imediata',
            color: '#dc2626',
            priority: 4
          },
          {
            value: 'warning',
            label: 'Aviso',
            description: 'Requer atenção',
            color: '#d97706',
            priority: 3
          },
          {
            value: 'info',
            label: 'Informativo',
            description: 'Para conhecimento',
            color: '#2563eb',
            priority: 2
          },
          {
            value: 'low',
            label: 'Baixo',
            description: 'Prioridade baixa',
            color: '#059669',
            priority: 1
          }
        ],
        thresholds: alertsService.thresholds
      }
    });
  })
);

// Helper functions
function calculateHealthScore(stats) {
  const { total_alerts, critical_alerts, warning_alerts } = stats;
  
  if (total_alerts === 0) return 100;
  
  let score = 100;
  score -= critical_alerts * 20; // -20 por alerta crítico
  score -= warning_alerts * 10;  // -10 por alerta de warning
  
  return Math.max(0, Math.min(100, score));
}

module.exports = router;