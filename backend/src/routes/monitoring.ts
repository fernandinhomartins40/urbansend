import { Router } from 'express';
import { QueueService } from '../services/queueService';
import { SMTPDeliveryService } from '../services/smtpDelivery';
import { DKIMManager } from '../services/dkimManager';
import db from '../config/database';
import { logger } from '../config/logger';
import { Env } from '../utils/env';

const router = Router();

/**
 * 🚀 UltraZend SMTP Monitoring Dashboard
 * Endpoints para monitoramento do servidor SMTP próprio
 */

// Health Check Principal do UltraZend
router.get('/health', async (req, res) => {
  try {
    const queueService = new QueueService();
    const smtpService = new SMTPDeliveryService();
    const dkimManager = new DKIMManager();
    
    // Verificar componentes principais
    const [queueStats, queueHealth, smtpConnectionTest] = await Promise.all([
      queueService.getQueueStats(),
      queueService.getHealth(),
      smtpService.testConnection()
    ]);

    const health = {
      status: 'UltraZend SMTP Server Running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: Env.get('NODE_ENV'),
      
      // Core System Status
      core: {
        smtp_delivery: 'Direct MX Records',
        postfix_enabled: false,
        dkim_enabled: true,
        queue_processing: true
      },
      
      // Component Health
      components: {
        smtp_delivery_service: smtpConnectionTest ? 'healthy' : 'degraded',
        queue_service: queueHealth.healthy ? 'healthy' : 'unhealthy',
        dkim_manager: 'healthy', // DKIM manager is always healthy if loaded
        database: 'healthy' // Will be checked below
      },
      
      // Queue Statistics
      queues: queueStats,
      
      // Memory & Performance
      performance: {
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        node_version: process.version
      }
    };

    // Testar conexão com banco de dados
    try {
      await db.raw('SELECT 1');
      health.components.database = 'healthy';
    } catch (error) {
      health.components.database = 'unhealthy';
      logger.error('Database health check failed:', error);
    }

    // Determinar status geral
    const allHealthy = Object.values(health.components).every(status => status === 'healthy');
    const hasUnhealthy = Object.values(health.components).includes('unhealthy');
    
    health.status = hasUnhealthy ? 'unhealthy' : 
                   allHealthy ? 'healthy' : 'degraded';

    const statusCode = hasUnhealthy ? 503 : 200;
    res.status(statusCode).json(health);
    
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Estatísticas de Entrega Detalhadas
router.get('/delivery-stats', async (req, res) => {
  try {
    const timeRange = req.query.range as string || '24h';
    const timeRangeMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[timeRange] || 24 * 60 * 60 * 1000;

    const since = new Date(Date.now() - timeRangeMs);

    // Estatísticas de entrega
    const deliveryStats = await db('email_delivery_queue')
      .select('status')
      .count('* as count')
      .where('created_at', '>=', since)
      .groupBy('status');

    // Estatísticas por domínio
    const domainStats = await db('email_delivery_queue')
      .select(db.raw('SUBSTR(to_address, INSTR(to_address, "@") + 1) as domain'))
      .select('status')
      .count('* as count')
      .where('created_at', '>=', since)
      .groupBy('domain', 'status')
      .orderBy('count', 'desc')
      .limit(20);

    // Taxa de entrega por hora (últimas 24h se range for 24h)
    let hourlyStats = [];
    if (timeRange === '24h') {
      hourlyStats = await db('email_delivery_queue')
        .select(db.raw('strftime("%Y-%m-%d %H:00:00", created_at) as hour'))
        .select('status')
        .count('* as count')
        .where('created_at', '>=', since)
        .groupBy('hour', 'status')
        .orderBy('hour');
    }

    // Métricas de performance
    const performanceStats = await db('email_delivery_queue')
      .select(db.raw('AVG(delivery_time) as avg_delivery_time'))
      .select(db.raw('MAX(delivery_time) as max_delivery_time'))
      .select(db.raw('MIN(delivery_time) as min_delivery_time'))
      .where('status', 'delivered')
      .where('created_at', '>=', since)
      .first();

    const stats = {
      period: timeRange,
      timestamp: new Date().toISOString(),
      summary: {
        total: deliveryStats.reduce((sum, stat) => sum + stat.count, 0),
        by_status: deliveryStats.reduce((acc, stat) => {
          acc[stat.status] = stat.count;
          return acc;
        }, {} as Record<string, number>)
      },
      domains: domainStats,
      performance: performanceStats || {},
      hourly: hourlyStats
    };

    // Calcular taxa de entrega
    const total = stats.summary.total;
    const delivered = stats.summary.by_status.delivered || 0;
    const failed = stats.summary.by_status.failed || 0;
    
    (stats.summary as any).delivery_rate = total > 0 ? ((delivered / total) * 100).toFixed(2) + '%' : '0%';
    (stats.summary as any).failure_rate = total > 0 ? ((failed / total) * 100).toFixed(2) + '%' : '0%';

    res.json(stats);
    
  } catch (error) {
    logger.error('Delivery stats error:', error);
    res.status(500).json({
      error: 'Failed to get delivery statistics'
    });
  }
});

// Status das Filas em Tempo Real
router.get('/queue-status', async (req, res) => {
  try {
    const queueService = new QueueService();
    const stats = await queueService.getQueueStats();
    const health = await queueService.getHealth();
    
    // Detalhes da fila de email
    const emailQueueDetails = await db('email_delivery_queue')
      .select('status')
      .select(db.raw('AVG(attempts) as avg_attempts'))
      .select(db.raw('COUNT(*) as count'))
      .groupBy('status');

    const queueStatus = {
      timestamp: new Date().toISOString(),
      healthy: health.healthy,
      queues: {
        email: {
          ...stats.email,
          details: emailQueueDetails
        },
        webhook: stats.webhook,
        analytics: stats.analytics
      },
      redis_connected: health.healthy // Redis health is part of overall health
    };

    res.json(queueStatus);
    
  } catch (error) {
    logger.error('Queue status error:', error);
    res.status(500).json({
      error: 'Failed to get queue status'
    });
  }
});

// Configuração do Sistema UltraZend
router.get('/system-config', async (req, res) => {
  try {
    const config = {
      ultrazend: {
        version: '1.0.0',
        mode: 'Pure SMTP Server',
        deployment_type: 'Direct MX Delivery'
      },
      smtp: {
        hostname: Env.get('ULTRAZEND_HOSTNAME', 'mail.ultrazend.com.br'),
        domain: Env.get('ULTRAZEND_DOMAIN', 'ultrazend.com.br'),
        port: Env.get('ULTRAZEND_SMTP_PORT', '25'),
        postfix_enabled: false
      },
      dkim: {
        enabled: true,
        domain: Env.get('DKIM_DOMAIN', 'ultrazend.com.br'),
        selector: Env.get('DKIM_SELECTOR', 'default'),
        key_path: Env.get('DKIM_PRIVATE_KEY_PATH', './configs/dkim-keys/')
      },
      features: {
        direct_mx_delivery: true,
        queue_processing: true,
        webhook_notifications: true,
        analytics_tracking: true,
        rate_limiting: true
      },
      limits: {
        max_delivery_attempts: 5,
        queue_retention_days: 30,
        log_retention_days: 7
      }
    };

    res.json(config);
    
  } catch (error) {
    logger.error('System config error:', error);
    res.status(500).json({
      error: 'Failed to get system configuration'
    });
  }
});

// Logs em Tempo Real (últimas N linhas)
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string || 'info';
    
    // Em um sistema real, você buscaria logs do sistema de logging
    // Por agora, retornamos logs mock baseados nos dados do banco
    
    const recentEmails = await db('email_delivery_queue')
      .select('*')
      .orderBy('created_at', 'desc')
      .limit(limit);

    const logs = recentEmails.map(email => ({
      timestamp: email.created_at,
      level: email.status === 'failed' ? 'error' : 'info',
      message: `Email ${email.status}: ${email.to_address}`,
      details: {
        to: email.to_address,
        subject: email.subject,
        status: email.status,
        attempts: email.attempts,
        error: email.error_message
      }
    }));

    res.json({
      logs,
      total: logs.length,
      level,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Logs error:', error);
    res.status(500).json({
      error: 'Failed to get logs'
    });
  }
});

// Métricas Prometheus (se habilitado)
router.get('/metrics', async (req, res) => {
  try {
    const queueService = new QueueService();
    const stats = await queueService.getQueueStats();
    
    // Formato Prometheus
    const metrics = [
      '# HELP ultrazend_emails_total Total number of emails processed',
      '# TYPE ultrazend_emails_total counter',
      `ultrazend_emails_total{status="delivered"} ${stats.email.completed}`,
      `ultrazend_emails_total{status="failed"} ${stats.email.failed}`,
      `ultrazend_emails_total{status="pending"} ${stats.email.waiting}`,
      '',
      '# HELP ultrazend_queue_size Current queue size',
      '# TYPE ultrazend_queue_size gauge',
      `ultrazend_queue_size{queue="email"} ${stats.email.waiting}`,
      `ultrazend_queue_size{queue="webhook"} ${stats.webhook.waiting}`,
      `ultrazend_queue_size{queue="analytics"} ${stats.analytics.waiting}`,
      '',
      '# HELP ultrazend_uptime_seconds Process uptime in seconds',
      '# TYPE ultrazend_uptime_seconds counter',
      `ultrazend_uptime_seconds ${process.uptime()}`,
      ''
    ].join('\n');

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
    
  } catch (error) {
    logger.error('Metrics error:', error);
    res.status(500).send('# Error generating metrics');
  }
});

export default router;