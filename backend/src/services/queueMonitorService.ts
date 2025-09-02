import { Queue, Job } from 'bull';
import { logger } from '../config/logger';
import { Database } from 'sqlite3';
import { promisify } from 'util';

export interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  processingRate: number;
  completionRate: number;
  failureRate: number;
}

export interface QueueHealthStatus {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  metrics: QueueMetrics[];
  lastCheck: Date;
  redisConnection: boolean;
  totalJobs: number;
  totalFailures: number;
}

export interface AlertConfig {
  id: string;
  name: string;
  queueName?: string;
  condition: 'high_failure_rate' | 'high_waiting_count' | 'queue_stuck' | 'redis_disconnection';
  threshold: number;
  enabled: boolean;
  cooldownMinutes: number;
  webhookUrl?: string;
  emailRecipients?: string[];
}

export class QueueMonitorService {
  private db: Database;
  private dbRun: (sql: string, params?: any[]) => Promise<any>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;
  
  private queues: Queue[] = [];
  private monitorInterval: NodeJS.Timeout | null = null;
  private alertConfigs: Map<string, AlertConfig> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();
  
  private readonly MONITOR_INTERVAL = 30000; // 30 segundos
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minuto

  constructor(queues: Queue[], database?: Database) {
    this.queues = queues;
    this.db = database || new Database('./ultrazend.sqlite');
    this.dbRun = promisify(this.db.run.bind(this.db));
    this.dbGet = promisify(this.db.get.bind(this.db));
    this.dbAll = promisify(this.db.all.bind(this.db));
    
    this.initializeTables();
    this.loadAlertConfigs();
  }

  private async initializeTables(): Promise<void> {
    try {
      // Tabela de métricas de fila
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS queue_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          queue_name TEXT NOT NULL,
          waiting_jobs INTEGER DEFAULT 0,
          active_jobs INTEGER DEFAULT 0,
          completed_jobs INTEGER DEFAULT 0,
          failed_jobs INTEGER DEFAULT 0,
          delayed_jobs INTEGER DEFAULT 0,
          is_paused BOOLEAN DEFAULT 0,
          processing_rate REAL DEFAULT 0,
          completion_rate REAL DEFAULT 0,
          failure_rate REAL DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de alertas
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS queue_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          queue_name TEXT,
          condition_type TEXT NOT NULL,
          threshold_value REAL NOT NULL,
          is_enabled BOOLEAN DEFAULT 1,
          cooldown_minutes INTEGER DEFAULT 15,
          webhook_url TEXT,
          email_recipients TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tabela de histórico de alertas
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS alert_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT NOT NULL,
          queue_name TEXT,
          condition_type TEXT NOT NULL,
          trigger_value REAL,
          threshold_value REAL,
          message TEXT,
          resolved BOOLEAN DEFAULT 0,
          triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME
        )
      `);

      // Tabela de health checks
      await this.dbRun(`
        CREATE TABLE IF NOT EXISTS queue_health_checks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          overall_status TEXT NOT NULL,
          redis_connected BOOLEAN DEFAULT 1,
          total_jobs INTEGER DEFAULT 0,
          total_failures INTEGER DEFAULT 0,
          issues_count INTEGER DEFAULT 0,
          issues_details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Índices para performance
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_queue_metrics_name_timestamp ON queue_metrics(queue_name, timestamp)`);
      await this.dbRun(`CREATE INDEX IF NOT EXISTS idx_alert_history_alert_id ON alert_history(alert_id, triggered_at)`);

      logger.info('QueueMonitorService: Tabelas inicializadas com sucesso');
    } catch (error) {
      logger.error('Erro ao inicializar tabelas do QueueMonitorService:', error);
      throw error;
    }
  }

  private async loadAlertConfigs(): Promise<void> {
    try {
      const alerts = await this.dbAll(`
        SELECT * FROM queue_alerts WHERE is_enabled = 1
      `);

      for (const alert of alerts) {
        this.alertConfigs.set(alert.alert_id, {
          id: alert.alert_id,
          name: alert.name,
          queueName: alert.queue_name,
          condition: alert.condition_type,
          threshold: alert.threshold_value,
          enabled: alert.is_enabled === 1,
          cooldownMinutes: alert.cooldown_minutes,
          webhookUrl: alert.webhook_url,
          emailRecipients: alert.email_recipients ? JSON.parse(alert.email_recipients) : []
        });
      }

      logger.info(`Carregadas ${alerts.length} configurações de alerta`);
    } catch (error) {
      logger.error('Erro ao carregar configurações de alerta:', error);
    }
  }

  startMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    logger.info('Iniciando monitoramento de filas');

    // Monitor principal das métricas
    this.monitorInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
      } catch (error) {
        logger.error('Erro no ciclo de monitoramento:', error);
      }
    }, this.MONITOR_INTERVAL);

    // Health check separado
    setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Erro no health check:', error);
      }
    }, this.HEALTH_CHECK_INTERVAL);

    // Coletar métricas iniciais
    this.collectMetrics();
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('Monitoramento de filas parado');
    }
  }

  private async collectMetrics(): Promise<void> {
    for (const queue of this.queues) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed()
        ]);

        const counts = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length
        };

        // Calcular taxas baseadas em dados históricos
        const rates = await this.calculateRates(queue.name);

        // Verificar se a fila está pausada
        const isPaused = await queue.isPaused();

        // Salvar métricas
        await this.dbRun(`
          INSERT INTO queue_metrics (
            queue_name, waiting_jobs, active_jobs, completed_jobs, failed_jobs, delayed_jobs,
            is_paused, processing_rate, completion_rate, failure_rate
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          queue.name,
          counts.waiting,
          counts.active,
          counts.completed,
          counts.failed,
          counts.delayed,
          isPaused ? 1 : 0,
          rates.processingRate,
          rates.completionRate,
          rates.failureRate
        ]);

        logger.debug(`Métricas coletadas para fila ${queue.name}:`, { counts, rates, isPaused });

      } catch (error) {
        logger.error(`Erro ao coletar métricas da fila ${queue.name}:`, error);
      }
    }
  }

  private async calculateRates(queueName: string): Promise<{
    processingRate: number;
    completionRate: number;
    failureRate: number;
  }> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const metrics = await this.dbAll(`
        SELECT * FROM queue_metrics 
        WHERE queue_name = ? AND timestamp > ? 
        ORDER BY timestamp DESC
        LIMIT 10
      `, [queueName, fiveMinutesAgo.toISOString()]);

      if (metrics.length < 2) {
        return { processingRate: 0, completionRate: 0, failureRate: 0 };
      }

      const latest = metrics[0];
      const oldest = metrics[metrics.length - 1];
      const timeDiffMinutes = (new Date(latest.timestamp).getTime() - new Date(oldest.timestamp).getTime()) / 60000;

      if (timeDiffMinutes === 0) {
        return { processingRate: 0, completionRate: 0, failureRate: 0 };
      }

      const completedDiff = latest.completed_jobs - oldest.completed_jobs;
      const failedDiff = latest.failed_jobs - oldest.failed_jobs;
      const totalProcessed = completedDiff + failedDiff;

      return {
        processingRate: totalProcessed / timeDiffMinutes,
        completionRate: totalProcessed > 0 ? (completedDiff / totalProcessed) * 100 : 100,
        failureRate: totalProcessed > 0 ? (failedDiff / totalProcessed) * 100 : 0
      };

    } catch (error) {
      logger.error(`Erro ao calcular taxas para ${queueName}:`, error);
      return { processingRate: 0, completionRate: 0, failureRate: 0 };
    }
  }

  private async checkAlerts(): Promise<void> {
    const currentMetrics = await this.getCurrentMetrics();

    for (const [alertId, config] of this.alertConfigs) {
      if (!config.enabled) continue;

      // Verificar cooldown
      const lastAlert = this.alertCooldowns.get(alertId);
      if (lastAlert) {
        const cooldownEnd = new Date(lastAlert.getTime() + config.cooldownMinutes * 60 * 1000);
        if (new Date() < cooldownEnd) {
          continue;
        }
      }

      const shouldTrigger = await this.shouldTriggerAlert(config, currentMetrics);
      
      if (shouldTrigger.trigger) {
        await this.triggerAlert(config, shouldTrigger.value, shouldTrigger.message);
      }
    }
  }

  private async getCurrentMetrics(): Promise<QueueMetrics[]> {
    const metricsData = await this.dbAll(`
      SELECT DISTINCT queue_name,
        (SELECT waiting_jobs FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as waiting,
        (SELECT active_jobs FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as active,
        (SELECT completed_jobs FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as completed,
        (SELECT failed_jobs FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as failed,
        (SELECT delayed_jobs FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as delayed,
        (SELECT is_paused FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as paused,
        (SELECT processing_rate FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as processing_rate,
        (SELECT completion_rate FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as completion_rate,
        (SELECT failure_rate FROM queue_metrics qm2 WHERE qm2.queue_name = qm1.queue_name ORDER BY timestamp DESC LIMIT 1) as failure_rate
      FROM queue_metrics qm1
    `);

    return metricsData.map(row => ({
      name: row.queue_name,
      waiting: row.waiting || 0,
      active: row.active || 0,
      completed: row.completed || 0,
      failed: row.failed || 0,
      delayed: row.delayed || 0,
      paused: row.paused === 1,
      processingRate: row.processing_rate || 0,
      completionRate: row.completion_rate || 0,
      failureRate: row.failure_rate || 0
    }));
  }

  private async shouldTriggerAlert(
    config: AlertConfig, 
    metrics: QueueMetrics[]
  ): Promise<{ trigger: boolean; value?: number; message?: string }> {
    
    const queueMetrics = config.queueName 
      ? metrics.find(m => m.name === config.queueName)
      : null;

    switch (config.condition) {
      case 'high_failure_rate':
        if (queueMetrics) {
          const failureRate = queueMetrics.failureRate;
          if (failureRate > config.threshold) {
            return {
              trigger: true,
              value: failureRate,
              message: `Taxa de falha alta na fila ${config.queueName}: ${failureRate.toFixed(2)}% (limite: ${config.threshold}%)`
            };
          }
        }
        break;

      case 'high_waiting_count':
        if (queueMetrics) {
          const waitingCount = queueMetrics.waiting;
          if (waitingCount > config.threshold) {
            return {
              trigger: true,
              value: waitingCount,
              message: `Muitos jobs aguardando na fila ${config.queueName}: ${waitingCount} jobs (limite: ${config.threshold})`
            };
          }
        }
        break;

      case 'queue_stuck':
        if (queueMetrics) {
          const processingRate = queueMetrics.processingRate;
          if (processingRate < config.threshold && queueMetrics.waiting > 0) {
            return {
              trigger: true,
              value: processingRate,
              message: `Fila ${config.queueName} aparenta estar travada: taxa de processamento ${processingRate.toFixed(2)} jobs/min (limite: ${config.threshold})`
            };
          }
        }
        break;

      case 'redis_disconnection':
        // Verificar conexão Redis através das filas
        try {
          await Promise.all(this.queues.map(q => q.client.ping()));
          return { trigger: false };
        } catch (error) {
          return {
            trigger: true,
            value: 1,
            message: 'Conexão com Redis perdida - filas indisponíveis'
          };
        }
    }

    return { trigger: false };
  }

  private async triggerAlert(config: AlertConfig, value: number, message: string): Promise<void> {
    try {
      // Registrar alerta no histórico
      await this.dbRun(`
        INSERT INTO alert_history (
          alert_id, queue_name, condition_type, trigger_value, threshold_value, message
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        config.id,
        config.queueName,
        config.condition,
        value,
        config.threshold,
        message
      ]);

      // Marcar cooldown
      this.alertCooldowns.set(config.id, new Date());

      // Enviar notificações
      await this.sendAlertNotifications(config, message);

      logger.warn(`Alerta acionado: ${config.name}`, { 
        alertId: config.id,
        condition: config.condition,
        value,
        threshold: config.threshold,
        message
      });

    } catch (error) {
      logger.error('Erro ao acionar alerta:', error);
    }
  }

  private async sendAlertNotifications(config: AlertConfig, message: string): Promise<void> {
    const notifications = [];

    // Webhook notification
    if (config.webhookUrl) {
      notifications.push(this.sendWebhookAlert(config.webhookUrl, {
        alertId: config.id,
        alertName: config.name,
        condition: config.condition,
        queueName: config.queueName,
        message,
        timestamp: new Date().toISOString()
      }));
    }

    // Email notifications
    if (config.emailRecipients && config.emailRecipients.length > 0) {
      notifications.push(this.sendEmailAlert(config.emailRecipients, {
        subject: `[UltraZend] Alerta de Fila: ${config.name}`,
        message,
        alertId: config.id
      }));
    }

    try {
      await Promise.allSettled(notifications);
    } catch (error) {
      logger.error('Erro ao enviar notificações de alerta:', error);
    }
  }

  private async sendWebhookAlert(webhookUrl: string, payload: any): Promise<void> {
    try {
      const { QueueService } = await import('./queueService');
      const queueService = new QueueService();

      await queueService.addWebhookJob({
        url: webhookUrl,
        method: 'POST',
        payload,
        headers: {
          'Content-Type': 'application/json',
          'X-Alert-Source': 'UltraZend-Queue-Monitor'
        },
        maxRetries: 3,
        eventType: 'queue_alert',
        entityId: 0,
        userId: 0
      });
    } catch (error) {
      logger.error('Erro ao enviar webhook de alerta:', error);
    }
  }

  private async sendEmailAlert(recipients: string[], alertData: any): Promise<void> {
    try {
      const { QueueService } = await import('./queueService');
      const queueService = new QueueService();

      for (const recipient of recipients) {
        await queueService.addEmailJob({
          emailId: Math.floor(Date.now() / 1000),
          from: 'alerts@ultrazend.com.br',
          to: recipient,
          subject: alertData.subject,
          html: this.generateAlertEmailHtml(alertData),
          text: alertData.message,
          priority: 1,
          userId: 0
        });
      }
    } catch (error) {
      logger.error('Erro ao enviar email de alerta:', error);
    }
  }

  private generateAlertEmailHtml(alertData: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Alerta UltraZend</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f44336; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <h2 style="margin: 0;">🚨 Alerta de Sistema</h2>
        </div>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
          <p><strong>Mensagem:</strong> ${alertData.message}</p>
          <p><strong>ID do Alerta:</strong> ${alertData.alertId}</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        </div>
        <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; border-left: 4px solid #2196F3;">
          <p><strong>Ação Recomendada:</strong> Verifique o dashboard de monitoramento e tome as medidas necessárias para resolver a situação.</p>
        </div>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #666;">
          <p>© 2024 UltraZend - Sistema de Monitoramento de Filas</p>
        </div>
      </body>
      </html>
    `;
  }

  async performHealthCheck(): Promise<QueueHealthStatus> {
    const metrics = await this.getCurrentMetrics();
    const issues: string[] = [];
    let redisConnection = true;

    // Verificar conexão Redis
    try {
      await Promise.all(this.queues.map(q => q.client.ping()));
    } catch (error) {
      redisConnection = false;
      issues.push('Conexão Redis perdida');
    }

    // Verificar estado das filas
    for (const metric of metrics) {
      if (metric.paused) {
        issues.push(`Fila ${metric.name} está pausada`);
      }
      
      if (metric.failureRate > 10) {
        issues.push(`Fila ${metric.name} com alta taxa de falha: ${metric.failureRate.toFixed(1)}%`);
      }
      
      if (metric.waiting > 1000) {
        issues.push(`Fila ${metric.name} com muitos jobs aguardando: ${metric.waiting}`);
      }
      
      if (metric.processingRate === 0 && metric.waiting > 0) {
        issues.push(`Fila ${metric.name} pode estar travada (sem processamento)`);
      }
    }

    // Determinar status geral
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = redisConnection ? 'warning' : 'critical';
    }

    const totalJobs = metrics.reduce((sum, m) => sum + m.waiting + m.active + m.delayed, 0);
    const totalFailures = metrics.reduce((sum, m) => sum + m.failed, 0);

    // Salvar health check
    await this.dbRun(`
      INSERT INTO queue_health_checks (
        overall_status, redis_connected, total_jobs, total_failures, 
        issues_count, issues_details
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      status,
      redisConnection ? 1 : 0,
      totalJobs,
      totalFailures,
      issues.length,
      JSON.stringify(issues)
    ]);

    const healthStatus: QueueHealthStatus = {
      status,
      issues,
      metrics,
      lastCheck: new Date(),
      redisConnection,
      totalJobs,
      totalFailures
    };

    logger.info('Health check realizado', {
      status,
      issuesCount: issues.length,
      totalJobs,
      redisConnection
    });

    return healthStatus;
  }

  async getQueueMetrics(queueName?: string, timeRange?: { start: Date; end: Date }): Promise<QueueMetrics[]> {
    let whereClause = '';
    const params: any[] = [];

    if (queueName) {
      whereClause = 'WHERE queue_name = ?';
      params.push(queueName);
    }

    if (timeRange) {
      whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'timestamp BETWEEN ? AND ?';
      params.push(timeRange.start.toISOString(), timeRange.end.toISOString());
    }

    const metrics = await this.dbAll(`
      SELECT * FROM queue_metrics 
      ${whereClause}
      ORDER BY queue_name, timestamp DESC
    `, params);

    return metrics.map(row => ({
      name: row.queue_name,
      waiting: row.waiting_jobs,
      active: row.active_jobs,
      completed: row.completed_jobs,
      failed: row.failed_jobs,
      delayed: row.delayed_jobs,
      paused: row.is_paused === 1,
      processingRate: row.processing_rate,
      completionRate: row.completion_rate,
      failureRate: row.failure_rate
    }));
  }

  async createAlert(config: Omit<AlertConfig, 'id'>): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await this.dbRun(`
      INSERT INTO queue_alerts (
        alert_id, name, queue_name, condition_type, threshold_value,
        is_enabled, cooldown_minutes, webhook_url, email_recipients
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      alertId,
      config.name,
      config.queueName,
      config.condition,
      config.threshold,
      config.enabled ? 1 : 0,
      config.cooldownMinutes,
      config.webhookUrl,
      config.emailRecipients ? JSON.stringify(config.emailRecipients) : null
    ]);

    this.alertConfigs.set(alertId, { ...config, id: alertId });
    
    logger.info(`Alerta criado: ${config.name}`, { alertId });
    return alertId;
  }

  async getMonitoringStatus(): Promise<any> {
    const healthStatus = await this.performHealthCheck();
    const recentMetrics = await this.getQueueMetrics(undefined, {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000),
      end: new Date()
    });

    return {
      monitoring: {
        active: this.monitorInterval !== null,
        interval: this.MONITOR_INTERVAL / 1000,
        queuesMonitored: this.queues.length
      },
      health: healthStatus,
      alerts: {
        configured: this.alertConfigs.size,
        triggered24h: await this.getTriggeredAlertsCount(24)
      },
      metrics: {
        queues: recentMetrics.length > 0 ? this.groupMetricsByQueue(recentMetrics) : [],
        lastCollection: recentMetrics.length > 0 ? recentMetrics[0] : null
      }
    };
  }

  private async getTriggeredAlertsCount(hours: number): Promise<number> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await this.dbGet(`
      SELECT COUNT(*) as count 
      FROM alert_history 
      WHERE triggered_at > ?
    `, [since.toISOString()]);
    
    return result.count || 0;
  }

  private groupMetricsByQueue(metrics: QueueMetrics[]): any[] {
    const grouped: { [key: string]: QueueMetrics[] } = {};
    
    for (const metric of metrics) {
      if (!grouped[metric.name]) {
        grouped[metric.name] = [];
      }
      grouped[metric.name].push(metric);
    }

    return Object.entries(grouped).map(([name, queueMetrics]) => ({
      name,
      current: queueMetrics[0],
      history: queueMetrics.slice(0, 10)
    }));
  }

  async close(): Promise<void> {
    this.stopMonitoring();
    
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Erro ao fechar conexão do QueueMonitorService:', err);
          reject(err);
        } else {
          logger.info('QueueMonitorService: Conexão fechada');
          resolve();
        }
      });
    });
  }
}