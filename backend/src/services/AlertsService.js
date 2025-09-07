const db = require('../config/database');
const { logger } = require('../config/logger');

/**
 * SPRINT 3 - Alerts Service
 * Serviço responsável pelo sistema de alertas do dashboard
 * Monitora métricas e gera alertas automáticos baseados em thresholds
 */
class AlertsService {
  constructor() {
    // Thresholds para alertas
    this.thresholds = {
      bounce_rate: {
        warning: 5,    // 5%
        critical: 10   // 10%
      },
      delivery_rate: {
        warning: 95,   // Abaixo de 95%
        critical: 90   // Abaixo de 90%
      },
      spam_rate: {
        warning: 0.1,  // 0.1%
        critical: 0.5  // 0.5%
      },
      domain_reputation: {
        warning: 70,   // Abaixo de 70
        critical: 50   // Abaixo de 50
      },
      volume_spike: {
        warning: 200,  // 200% acima da média
        critical: 500  // 500% acima da média
      }
    };

    this.alertTypes = {
      HIGH_BOUNCE_RATE: {
        type: 'deliverability',
        title: 'Taxa de Bounce Alta',
        priority: 'high'
      },
      LOW_DELIVERY_RATE: {
        type: 'deliverability',
        title: 'Taxa de Entrega Baixa',
        priority: 'high'
      },
      HIGH_SPAM_RATE: {
        type: 'reputation',
        title: 'Taxa de Spam Alta',
        priority: 'critical'
      },
      DOMAIN_REPUTATION_LOW: {
        type: 'reputation',
        title: 'Reputação do Domínio Baixa',
        priority: 'medium'
      },
      VOLUME_SPIKE: {
        type: 'volume',
        title: 'Pico de Volume Anormal',
        priority: 'medium'
      },
      DKIM_NOT_CONFIGURED: {
        type: 'configuration',
        title: 'DKIM Não Configurado',
        priority: 'high'
      },
      SPF_ISSUES: {
        type: 'configuration',
        title: 'Problemas com SPF',
        priority: 'medium'
      },
      INACTIVE_DOMAIN: {
        type: 'configuration',
        title: 'Domínio Inativo',
        priority: 'low'
      }
    };
  }

  /**
   * Obter alertas ativos para um usuário
   */
  async getActiveAlerts(userId, options = {}) {
    try {
      const { includeResolved = false, severity = null, type = null, limit = 50 } = options;

      logger.info('AlertsService: Obtendo alertas ativos', {
        userId,
        includeResolved,
        severity,
        type
      });

      // Primeiro, gerar/atualizar alertas baseados nas métricas atuais
      await this.generateSystemAlerts(userId);

      let query = db('system_alerts')
        .where('user_id', userId);

      if (!includeResolved) {
        query = query.where('status', '!=', 'resolved');
      }

      if (severity) {
        query = query.where('severity', severity);
      }

      if (type) {
        query = query.where('alert_type', type);
      }

      const alerts = await query
        .orderBy('severity_order', 'desc')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .select([
          'id', 'alert_type', 'title', 'message', 'severity',
          'status', 'created_at', 'updated_at', 'metadata'
        ]);

      // Parse metadata JSON
      const parsedAlerts = alerts.map(alert => ({
        ...alert,
        metadata: alert.metadata ? JSON.parse(alert.metadata) : null
      }));

      logger.info('AlertsService: Alertas obtidos', {
        userId,
        alertsCount: parsedAlerts.length,
        activeAlerts: parsedAlerts.filter(a => a.status === 'active').length
      });

      return parsedAlerts;
    } catch (error) {
      logger.error('AlertsService: Erro ao obter alertas ativos', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Gerar alertas automáticos baseados em métricas
   */
  async generateSystemAlerts(userId) {
    try {
      logger.info('AlertsService: Gerando alertas do sistema', { userId });

      // Verificar métricas de deliverability
      await this.checkDeliverabilityAlerts(userId);

      // Verificar configuração de domínios
      await this.checkDomainConfigurationAlerts(userId);

      // Verificar picos de volume
      await this.checkVolumeAlerts(userId);

      // Verificar reputação
      await this.checkReputationAlerts(userId);

      logger.info('AlertsService: Alertas do sistema gerados', { userId });
    } catch (error) {
      logger.error('AlertsService: Erro ao gerar alertas do sistema', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Verificar alertas de deliverability
   */
  async checkDeliverabilityAlerts(userId) {
    try {
      // Métricas dos últimos 7 dias
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000));

      const metrics = await db('emails')
        .where('user_id', userId)
        .whereBetween('created_at', [startDate, endDate])
        .select(
          db.raw('COUNT(*) as total_emails'),
          db.raw('COUNT(CASE WHEN status = "sent" THEN 1 END) as sent_emails'),
          db.raw('COUNT(CASE WHEN status = "delivered" THEN 1 END) as delivered_emails'),
          db.raw('COUNT(CASE WHEN status = "bounced" THEN 1 END) as bounced_emails'),
          db.raw('COUNT(CASE WHEN status = "complained" THEN 1 END) as complained_emails')
        )
        .first();

      const totalEmails = parseInt(metrics.total_emails) || 0;
      const sentEmails = parseInt(metrics.sent_emails) || 0;
      const deliveredEmails = parseInt(metrics.delivered_emails) || 0;
      const bouncedEmails = parseInt(metrics.bounced_emails) || 0;
      const complainedEmails = parseInt(metrics.complained_emails) || 0;

      if (sentEmails > 0) {
        const bounceRate = (bouncedEmails / sentEmails) * 100;
        const deliveryRate = (deliveredEmails / sentEmails) * 100;
        const spamRate = (complainedEmails / sentEmails) * 100;

        // Alertas de bounce rate
        if (bounceRate >= this.thresholds.bounce_rate.critical) {
          await this.createAlert(userId, 'HIGH_BOUNCE_RATE', {
            severity: 'critical',
            message: `Taxa de bounce crítica: ${bounceRate.toFixed(2)}%. Verifique a qualidade da sua lista de emails.`,
            metadata: {
              bounce_rate: bounceRate,
              bounced_emails: bouncedEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        } else if (bounceRate >= this.thresholds.bounce_rate.warning) {
          await this.createAlert(userId, 'HIGH_BOUNCE_RATE', {
            severity: 'warning',
            message: `Taxa de bounce elevada: ${bounceRate.toFixed(2)}%. Considere limpar sua lista de emails.`,
            metadata: {
              bounce_rate: bounceRate,
              bounced_emails: bouncedEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        }

        // Alertas de delivery rate
        if (deliveryRate <= this.thresholds.delivery_rate.critical) {
          await this.createAlert(userId, 'LOW_DELIVERY_RATE', {
            severity: 'critical',
            message: `Taxa de entrega crítica: ${deliveryRate.toFixed(2)}%. Problemas graves de deliverability detectados.`,
            metadata: {
              delivery_rate: deliveryRate,
              delivered_emails: deliveredEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        } else if (deliveryRate <= this.thresholds.delivery_rate.warning) {
          await this.createAlert(userId, 'LOW_DELIVERY_RATE', {
            severity: 'warning',
            message: `Taxa de entrega baixa: ${deliveryRate.toFixed(2)}%. Verifique configurações de DNS.`,
            metadata: {
              delivery_rate: deliveryRate,
              delivered_emails: deliveredEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        }

        // Alertas de spam rate
        if (spamRate >= this.thresholds.spam_rate.critical) {
          await this.createAlert(userId, 'HIGH_SPAM_RATE', {
            severity: 'critical',
            message: `Taxa de spam crítica: ${spamRate.toFixed(2)}%. Sua reputação está em risco.`,
            metadata: {
              spam_rate: spamRate,
              complained_emails: complainedEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        } else if (spamRate >= this.thresholds.spam_rate.warning) {
          await this.createAlert(userId, 'HIGH_SPAM_RATE', {
            severity: 'warning',
            message: `Taxa de spam elevada: ${spamRate.toFixed(2)}%. Revise o conteúdo dos seus emails.`,
            metadata: {
              spam_rate: spamRate,
              complained_emails: complainedEmails,
              total_sent: sentEmails,
              period: '7 dias'
            }
          });
        }
      }
    } catch (error) {
      logger.error('AlertsService: Erro ao verificar alertas de deliverability', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Verificar alertas de configuração de domínio
   */
  async checkDomainConfigurationAlerts(userId) {
    try {
      const domains = await db('domains')
        .where('user_id', userId)
        .select(['id', 'domain_name', 'is_active', 'dkim_configured', 'spf_configured', 'dmarc_configured']);

      for (const domain of domains) {
        // DKIM não configurado
        if (!domain.dkim_configured) {
          await this.createAlert(userId, 'DKIM_NOT_CONFIGURED', {
            severity: 'warning',
            message: `DKIM não está configurado para o domínio ${domain.domain_name}. Isso pode afetar sua reputação.`,
            metadata: {
              domain_id: domain.id,
              domain_name: domain.domain_name
            }
          });
        }

        // SPF não configurado
        if (!domain.spf_configured) {
          await this.createAlert(userId, 'SPF_ISSUES', {
            severity: 'warning',
            message: `SPF não está configurado para o domínio ${domain.domain_name}.`,
            metadata: {
              domain_id: domain.id,
              domain_name: domain.domain_name
            }
          });
        }

        // Domínio inativo
        if (!domain.is_active) {
          await this.createAlert(userId, 'INACTIVE_DOMAIN', {
            severity: 'info',
            message: `O domínio ${domain.domain_name} está inativo.`,
            metadata: {
              domain_id: domain.id,
              domain_name: domain.domain_name
            }
          });
        }
      }
    } catch (error) {
      logger.error('AlertsService: Erro ao verificar alertas de configuração de domínio', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Verificar alertas de volume
   */
  async checkVolumeAlerts(userId) {
    try {
      const today = new Date();
      const yesterday = new Date(today.getTime() - (24 * 60 * 60 * 1000));
      const lastWeek = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));

      // Volume de hoje
      const todayVolume = await db('emails')
        .where('user_id', userId)
        .whereBetween('created_at', [yesterday, today])
        .count('* as count')
        .first();

      // Média dos últimos 7 dias
      const avgVolume = await db('emails')
        .where('user_id', userId)
        .whereBetween('created_at', [lastWeek, yesterday])
        .count('* as count')
        .first();

      const todayCount = parseInt(todayVolume.count) || 0;
      const avgCount = parseInt(avgVolume.count) / 7 || 1; // Evitar divisão por zero

      const spikePercentage = ((todayCount - avgCount) / avgCount) * 100;

      if (spikePercentage >= this.thresholds.volume_spike.critical) {
        await this.createAlert(userId, 'VOLUME_SPIKE', {
          severity: 'warning',
          message: `Pico de volume crítico detectado: ${spikePercentage.toFixed(0)}% acima da média.`,
          metadata: {
            today_volume: todayCount,
            avg_volume: Math.round(avgCount),
            spike_percentage: spikePercentage
          }
        });
      } else if (spikePercentage >= this.thresholds.volume_spike.warning) {
        await this.createAlert(userId, 'VOLUME_SPIKE', {
          severity: 'info',
          message: `Volume de envios ${spikePercentage.toFixed(0)}% acima da média. Monitore métricas de deliverability.`,
          metadata: {
            today_volume: todayCount,
            avg_volume: Math.round(avgCount),
            spike_percentage: spikePercentage
          }
        });
      }
    } catch (error) {
      logger.error('AlertsService: Erro ao verificar alertas de volume', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Verificar alertas de reputação
   */
  async checkReputationAlerts(userId) {
    try {
      const domains = await db('domains')
        .where('user_id', userId)
        .where('is_active', true)
        .select(['id', 'domain_name', 'reputation_score']);

      for (const domain of domains) {
        const reputationScore = domain.reputation_score || 100;

        if (reputationScore <= this.thresholds.domain_reputation.critical) {
          await this.createAlert(userId, 'DOMAIN_REPUTATION_LOW', {
            severity: 'critical',
            message: `Reputação crítica para ${domain.domain_name}: ${reputationScore}/100. Ação imediata necessária.`,
            metadata: {
              domain_id: domain.id,
              domain_name: domain.domain_name,
              reputation_score: reputationScore
            }
          });
        } else if (reputationScore <= this.thresholds.domain_reputation.warning) {
          await this.createAlert(userId, 'DOMAIN_REPUTATION_LOW', {
            severity: 'warning',
            message: `Reputação baixa para ${domain.domain_name}: ${reputationScore}/100. Monitore métricas.`,
            metadata: {
              domain_id: domain.id,
              domain_name: domain.domain_name,
              reputation_score: reputationScore
            }
          });
        }
      }
    } catch (error) {
      logger.error('AlertsService: Erro ao verificar alertas de reputação', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Criar um alerta
   */
  async createAlert(userId, alertType, options = {}) {
    try {
      const alertConfig = this.alertTypes[alertType];
      if (!alertConfig) {
        throw new Error(`Tipo de alerta não reconhecido: ${alertType}`);
      }

      const { severity, message, metadata = null } = options;

      // Verificar se já existe um alerta similar ativo
      const existingAlert = await db('system_alerts')
        .where('user_id', userId)
        .where('alert_type', alertType)
        .where('status', 'active')
        .first();

      if (existingAlert) {
        // Atualizar alerta existente
        await db('system_alerts')
          .where('id', existingAlert.id)
          .update({
            message,
            severity,
            metadata: metadata ? JSON.stringify(metadata) : null,
            updated_at: new Date()
          });

        logger.debug('AlertsService: Alerta atualizado', {
          userId,
          alertType,
          alertId: existingAlert.id
        });

        return existingAlert.id;
      } else {
        // Criar novo alerta
        const severityOrder = this.getSeverityOrder(severity);

        const alertId = await db('system_alerts').insert({
          user_id: userId,
          alert_type: alertType,
          title: alertConfig.title,
          message,
          severity,
          severity_order: severityOrder,
          status: 'active',
          metadata: metadata ? JSON.stringify(metadata) : null,
          created_at: new Date(),
          updated_at: new Date()
        }).returning('id');

        const newAlertId = Array.isArray(alertId) ? alertId[0].id || alertId[0] : alertId;

        logger.debug('AlertsService: Novo alerta criado', {
          userId,
          alertType,
          alertId: newAlertId,
          severity
        });

        return newAlertId;
      }
    } catch (error) {
      logger.error('AlertsService: Erro ao criar alerta', {
        userId,
        alertType,
        error: error.message
      });
    }
  }

  /**
   * Marcar alerta como resolvido
   */
  async resolveAlert(userId, alertId, resolvedBy = 'system') {
    try {
      const updated = await db('system_alerts')
        .where('id', alertId)
        .where('user_id', userId)
        .update({
          status: 'resolved',
          resolved_at: new Date(),
          resolved_by: resolvedBy,
          updated_at: new Date()
        });

      if (updated > 0) {
        logger.info('AlertsService: Alerta resolvido', {
          userId,
          alertId,
          resolvedBy
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('AlertsService: Erro ao resolver alerta', {
        userId,
        alertId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Obter estatísticas de alertas
   */
  async getAlertsStats(userId) {
    try {
      const stats = await db('system_alerts')
        .where('user_id', userId)
        .select(
          db.raw('COUNT(*) as total_alerts'),
          db.raw('COUNT(CASE WHEN status = "active" THEN 1 END) as active_alerts'),
          db.raw('COUNT(CASE WHEN severity = "critical" AND status = "active" THEN 1 END) as critical_alerts'),
          db.raw('COUNT(CASE WHEN severity = "warning" AND status = "active" THEN 1 END) as warning_alerts'),
          db.raw('COUNT(CASE WHEN severity = "info" AND status = "active" THEN 1 END) as info_alerts')
        )
        .first();

      return {
        total_alerts: parseInt(stats.total_alerts) || 0,
        active_alerts: parseInt(stats.active_alerts) || 0,
        critical_alerts: parseInt(stats.critical_alerts) || 0,
        warning_alerts: parseInt(stats.warning_alerts) || 0,
        info_alerts: parseInt(stats.info_alerts) || 0
      };
    } catch (error) {
      logger.error('AlertsService: Erro ao obter estatísticas de alertas', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Métodos auxiliares

  getSeverityOrder(severity) {
    const orders = {
      'critical': 4,
      'warning': 3,
      'info': 2,
      'low': 1
    };
    return orders[severity] || 1;
  }
}

module.exports = { AlertsService };