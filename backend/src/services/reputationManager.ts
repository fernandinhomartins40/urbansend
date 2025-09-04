import { logger } from '../config/logger';
import db from '../config/database';

export interface ReputationCheck {
  allowed: boolean;
  reason?: string;
  score?: number;
  recommendations?: string[];
}

export interface DomainReputation {
  domain: string;
  score: number;
  successful_deliveries: number;
  failed_deliveries: number;
  bounce_rate: number;
  last_success: Date | null;
  last_failure: Date | null;
  status: 'excellent' | 'good' | 'warning' | 'poor' | 'blocked';
}

export interface MXServerReputation {
  mx_server: string;
  domain: string;
  score: number;
  successful_deliveries: number;
  failed_deliveries: number;
  avg_response_time: number;
  last_success: Date | null;
  last_failure: Date | null;
  failure_reasons: string[];
}

export class ReputationManager {
  private domainScores: Map<string, number> = new Map();
  private mxServerScores: Map<string, number> = new Map();
  
  // Thresholds para classificação
  private readonly EXCELLENT_THRESHOLD = 95;
  private readonly GOOD_THRESHOLD = 80;
  private readonly WARNING_THRESHOLD = 60;
  private readonly POOR_THRESHOLD = 40;

  constructor() {
    this.initializeReputation();
    this.startReputationCleanup();
  }

  private async initializeReputation() {
    try {
      await this.validateRequiredTables();
      await this.loadReputationData();
      
      logger.info('ReputationManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ReputationManager', { error });
    }
  }

  private async validateRequiredTables() {
    try {
      const requiredTables = [
        'domain_reputation',
        'mx_server_reputation', 
        'delivery_history'
      ];

      for (const tableName of requiredTables) {
        const hasTable = await db.schema.hasTable(tableName);
        if (!hasTable) {
          throw new Error(`Tabela obrigatória '${tableName}' não encontrada. Execute as migrations primeiro.`);
        }
      }

      logger.info('ReputationManager: Todas as tabelas obrigatórias validadas com sucesso');
    } catch (error) {
      logger.error('Erro ao validar tabelas do ReputationManager:', error);
      throw error;
    }
  }

  private async loadReputationData() {
    try {
      // Carregar scores de domínios em memória para performance
      const domainReps = await db('domain_reputation')
        .select('domain', 'score');
      
      domainReps.forEach(rep => {
        this.domainScores.set(rep.domain, rep.score);
      });

      // Carregar scores de servidores MX
      const mxReps = await db('mx_server_reputation')
        .select('mx_server', 'score');
      
      mxReps.forEach(rep => {
        this.mxServerScores.set(rep.mx_server, rep.score);
      });

      logger.info('Reputation data loaded', {
        domains: this.domainScores.size,
        mxServers: this.mxServerScores.size
      });
    } catch (error) {
      logger.error('Failed to load reputation data', { error });
    }
  }

  public async checkDeliveryAllowed(domain: string): Promise<ReputationCheck> {
    try {
      const reputation = await this.getDomainReputation(domain);
      
      if (!reputation) {
        // Domínio novo - permitir com score neutro
        return {
          allowed: true,
          score: 100,
          recommendations: ['New domain - monitoring delivery performance']
        };
      }

      const score = reputation.score;
      const recommendations: string[] = [];

      // Determinar se entrega é permitida baseada no score
      if (score < this.POOR_THRESHOLD) {
        return {
          allowed: false,
          reason: `Domain reputation too low (${score}/100)`,
          score,
          recommendations: [
            'Improve email content quality',
            'Reduce bounce rate',
            'Monitor spam complaints',
            'Consider domain warm-up strategy'
          ]
        };
      }

      // Adicionar recomendações baseadas no score
      if (score < this.WARNING_THRESHOLD) {
        recommendations.push(
          'Domain reputation needs improvement',
          'Monitor delivery rates closely',
          'Review email content for spam triggers'
        );
      } else if (score < this.GOOD_THRESHOLD) {
        recommendations.push(
          'Consider improving email authentication',
          'Monitor bounce rates'
        );
      }

      // Verificar taxa de bounce
      if (reputation.bounce_rate > 10) {
        recommendations.push(
          `High bounce rate (${reputation.bounce_rate}%) - clean email lists`,
          'Implement double opt-in',
          'Remove inactive recipients'
        );
      }

      return {
        allowed: true,
        score,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };

    } catch (error) {
      logger.error('Failed to check delivery permission', { error, domain });
      return { allowed: true }; // Allow on error to avoid disruption
    }
  }

  public async recordSuccessfulDelivery(
    domain: string, 
    mxServer: string,
    responseTime?: number,
    messageId?: string,
    recipientEmail?: string
  ): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        // Registrar no histórico
        await trx('delivery_history').insert({
          domain,
          mx_server: mxServer,
          status: 'success',
          response_time: responseTime,
          message_id: messageId,
          recipient_email: recipientEmail,
          attempted_at: new Date()
        });

        // Atualizar reputação do domínio
        await this.updateDomainReputation(domain, true, trx);

        // Atualizar reputação do servidor MX
        await this.updateMXReputation(domain, mxServer, true, responseTime, trx);
      });

      // Atualizar cache em memória
      await this.refreshReputationCache(domain, mxServer);

      logger.debug('Successful delivery recorded', {
        domain,
        mxServer,
        responseTime
      });

    } catch (error) {
      logger.error('Failed to record successful delivery', { 
        error, 
        domain, 
        mxServer 
      });
    }
  }

  public async recordFailedDelivery(
    domain: string, 
    mxServer: string, 
    failureReason: string,
    responseTime?: number,
    messageId?: string,
    recipientEmail?: string
  ): Promise<void> {
    try {
      await db.transaction(async (trx) => {
        // Registrar no histórico
        await trx('delivery_history').insert({
          domain,
          mx_server: mxServer,
          status: 'failed',
          failure_reason: failureReason,
          response_time: responseTime,
          message_id: messageId,
          recipient_email: recipientEmail,
          attempted_at: new Date()
        });

        // Atualizar reputação do domínio
        await this.updateDomainReputation(domain, false, trx);

        // Atualizar reputação do servidor MX
        await this.updateMXReputation(
          domain, 
          mxServer, 
          false, 
          responseTime, 
          trx, 
          failureReason
        );
      });

      // Atualizar cache em memória
      await this.refreshReputationCache(domain, mxServer);

      logger.warn('Failed delivery recorded', {
        domain,
        mxServer,
        failureReason,
        responseTime
      });

    } catch (error) {
      logger.error('Failed to record failed delivery', { 
        error, 
        domain, 
        mxServer, 
        failureReason 
      });
    }
  }

  private async updateDomainReputation(
    domain: string,
    success: boolean,
    trx?: any
  ): Promise<void> {
    const query = trx || db;

    // Buscar ou criar registro de reputação
    const existing = await query('domain_reputation')
      .where('domain', domain)
      .first();

    if (existing) {
      // Calcular novo score baseado no histórico
      const newSuccessful = success ? existing.successful_deliveries + 1 : existing.successful_deliveries;
      const newFailed = success ? existing.failed_deliveries : existing.failed_deliveries + 1;
      const totalDeliveries = newSuccessful + newFailed;
      
      // Fórmula de score: (sucessos / total) * 100, com peso para histórico recente
      let newScore = (newSuccessful / totalDeliveries) * 100;
      
      // Aplicar penalty por falhas consecutivas
      if (!success && existing.last_failure) {
        const hoursSinceLastFailure = (Date.now() - existing.last_failure.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastFailure < 24) {
          newScore = Math.max(newScore - 5, 0); // Penalty por falhas recentes
        }
      }

      // Calcular nova taxa de bounce
      const bounceRate = (newFailed / totalDeliveries) * 100;
      const status = this.getReputationStatus(newScore);

      await query('domain_reputation')
        .where('domain', domain)
        .update({
          score: newScore,
          successful_deliveries: newSuccessful,
          failed_deliveries: newFailed,
          bounce_rate: bounceRate,
          last_success: success ? new Date() : existing.last_success,
          last_failure: success ? existing.last_failure : new Date(),
          status,
          updated_at: new Date()
        });
    } else {
      // Criar novo registro
      await query('domain_reputation').insert({
        domain,
        score: success ? 100 : 50,
        successful_deliveries: success ? 1 : 0,
        failed_deliveries: success ? 0 : 1,
        bounce_rate: success ? 0 : 100,
        last_success: success ? new Date() : null,
        last_failure: success ? null : new Date(),
        status: success ? 'good' : 'warning'
      });
    }
  }

  private async updateMXReputation(
    domain: string,
    mxServer: string,
    success: boolean,
    responseTime?: number,
    trx?: any,
    failureReason?: string
  ): Promise<void> {
    const query = trx || db;

    const existing = await query('mx_server_reputation')
      .where('mx_server', mxServer)
      .where('domain', domain)
      .first();

    if (existing) {
      const newSuccessful = success ? existing.successful_deliveries + 1 : existing.successful_deliveries;
      const newFailed = success ? existing.failed_deliveries : existing.failed_deliveries + 1;
      const totalDeliveries = newSuccessful + newFailed;
      
      let newScore = (newSuccessful / totalDeliveries) * 100;

      // Atualizar tempo médio de resposta
      let newAvgResponseTime = existing.avg_response_time;
      if (responseTime && success) {
        const totalResponses = existing.successful_deliveries;
        newAvgResponseTime = totalResponses > 0 
          ? ((existing.avg_response_time * totalResponses) + responseTime) / (totalResponses + 1)
          : responseTime;
      }

      // Atualizar razões de falha
      let failureReasons = [];
      try {
        failureReasons = existing.failure_reasons ? JSON.parse(existing.failure_reasons) : [];
      } catch (e) {
        failureReasons = [];
      }

      if (!success && failureReason) {
        failureReasons.push(failureReason);
        // Manter apenas as últimas 10 razões
        if (failureReasons.length > 10) {
          failureReasons = failureReasons.slice(-10);
        }
      }

      await query('mx_server_reputation')
        .where('mx_server', mxServer)
        .where('domain', domain)
        .update({
          score: newScore,
          successful_deliveries: newSuccessful,
          failed_deliveries: newFailed,
          avg_response_time: newAvgResponseTime,
          last_success: success ? new Date() : existing.last_success,
          last_failure: success ? existing.last_failure : new Date(),
          failure_reasons: JSON.stringify(failureReasons),
          updated_at: new Date()
        });
    } else {
      // Criar novo registro
      await query('mx_server_reputation').insert({
        mx_server: mxServer,
        domain,
        score: success ? 100 : 50,
        successful_deliveries: success ? 1 : 0,
        failed_deliveries: success ? 0 : 1,
        avg_response_time: responseTime || 0,
        last_success: success ? new Date() : null,
        last_failure: success ? null : new Date(),
        failure_reasons: failureReason ? JSON.stringify([failureReason]) : JSON.stringify([])
      });
    }
  }

  private getReputationStatus(score: number): string {
    if (score >= this.EXCELLENT_THRESHOLD) return 'excellent';
    if (score >= this.GOOD_THRESHOLD) return 'good';
    if (score >= this.WARNING_THRESHOLD) return 'warning';
    if (score >= this.POOR_THRESHOLD) return 'poor';
    return 'blocked';
  }

  private async refreshReputationCache(domain: string, mxServer?: string) {
    try {
      // Atualizar cache do domínio
      const domainRep = await db('domain_reputation')
        .where('domain', domain)
        .select('score')
        .first();
      
      if (domainRep) {
        this.domainScores.set(domain, domainRep.score);
      }

      // Atualizar cache do servidor MX se fornecido
      if (mxServer) {
        const mxRep = await db('mx_server_reputation')
          .where('mx_server', mxServer)
          .select('score')
          .first();
        
        if (mxRep) {
          this.mxServerScores.set(mxServer, mxRep.score);
        }
      }
    } catch (error) {
      logger.error('Failed to refresh reputation cache', { error, domain, mxServer });
    }
  }

  public async getDomainReputation(domain: string): Promise<DomainReputation | null> {
    try {
      const reputation = await db('domain_reputation')
        .where('domain', domain)
        .first();

      return reputation ? {
        domain: reputation.domain,
        score: reputation.score,
        successful_deliveries: reputation.successful_deliveries,
        failed_deliveries: reputation.failed_deliveries,
        bounce_rate: reputation.bounce_rate,
        last_success: reputation.last_success,
        last_failure: reputation.last_failure,
        status: reputation.status
      } : null;
    } catch (error) {
      logger.error('Failed to get domain reputation', { error, domain });
      return null;
    }
  }

  public async getMXServerReputation(
    mxServer: string,
    domain?: string
  ): Promise<MXServerReputation[]> {
    try {
      let query = db('mx_server_reputation')
        .where('mx_server', mxServer);

      if (domain) {
        query = query.where('domain', domain);
      }

      const reputations = await query.select('*');

      return reputations.map(rep => ({
        mx_server: rep.mx_server,
        domain: rep.domain,
        score: rep.score,
        successful_deliveries: rep.successful_deliveries,
        failed_deliveries: rep.failed_deliveries,
        avg_response_time: rep.avg_response_time,
        last_success: rep.last_success,
        last_failure: rep.last_failure,
        failure_reasons: rep.failure_reasons ? JSON.parse(rep.failure_reasons) : []
      }));
    } catch (error) {
      logger.error('Failed to get MX server reputation', { error, mxServer });
      return [];
    }
  }

  public async getReputationStats(): Promise<any> {
    try {
      const [
        totalDomains,
        excellentDomains,
        goodDomains,
        warningDomains,
        poorDomains,
        recentDeliveries
      ] = await Promise.all([
        db('domain_reputation').count('* as count').first(),
        db('domain_reputation').where('status', 'excellent').count('* as count').first(),
        db('domain_reputation').where('status', 'good').count('* as count').first(),
        db('domain_reputation').where('status', 'warning').count('* as count').first(),
        db('domain_reputation').where('status', 'poor').count('* as count').first(),
        db('delivery_history')
          .where('attempted_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .groupBy('status')
          .count('* as count')
          .select('status')
      ]);

      const recentStats = recentDeliveries.reduce((acc: any, curr: any) => {
        acc[curr.status] = curr.count;
        return acc;
      }, {});

      return {
        domains: {
          total: totalDomains?.count || 0,
          excellent: excellentDomains?.count || 0,
          good: goodDomains?.count || 0,
          warning: warningDomains?.count || 0,
          poor: poorDomains?.count || 0
        },
        last_24h: {
          successful: recentStats.success || 0,
          failed: recentStats.failed || 0,
          bounced: recentStats.bounced || 0
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get reputation stats', { error });
      return {
        domains: { total: 0, excellent: 0, good: 0, warning: 0, poor: 0 },
        last_24h: { successful: 0, failed: 0, bounced: 0 },
        timestamp: new Date().toISOString()
      };
    }
  }

  // Limpeza automática de dados antigos
  private startReputationCleanup(): void {
    setInterval(async () => {
      try {
        const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 dias
        
        const deleted = await db('delivery_history')
          .where('attempted_at', '<', cutoffDate)
          .del();

        if (deleted > 0) {
          logger.info('Cleaned up old delivery history records', { deleted });
        }
      } catch (error) {
        logger.error('Reputation cleanup failed', { error });
      }
    }, 24 * 60 * 60 * 1000); // Executar diariamente
  }

  // Método para recalcular reputações (manutenção)
  public async recalculateReputations(): Promise<void> {
    try {
      logger.info('Starting reputation recalculation');

      // Recalcular reputação de todos os domínios
      const domains = await db('delivery_history')
        .distinct('domain')
        .select('domain');

      for (const { domain } of domains) {
        const deliveries = await db('delivery_history')
          .where('domain', domain)
          .where('attempted_at', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .select('status');

        const successful = deliveries.filter(d => d.status === 'success').length;
        const failed = deliveries.filter(d => d.status !== 'success').length;
        const total = successful + failed;

        if (total > 0) {
          const score = (successful / total) * 100;
          const bounceRate = (failed / total) * 100;
          const status = this.getReputationStatus(score);

          await db('domain_reputation')
            .where('domain', domain)
            .update({
              score,
              bounce_rate: bounceRate,
              status,
              updated_at: new Date()
            });
        }
      }

      // Recarregar dados em cache
      await this.loadReputationData();

      logger.info('Reputation recalculation completed');
    } catch (error) {
      logger.error('Failed to recalculate reputations', { error });
    }
  }
}