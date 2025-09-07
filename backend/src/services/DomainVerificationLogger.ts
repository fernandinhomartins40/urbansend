import { logger, Logger } from '../config/logger';
import db from '../config/database';

export interface DomainVerificationAttempt {
  domainId: number;
  domainName: string;
  userId?: number;
  verificationToken?: string;
  attempts: {
    ownership: { status: 'success' | 'failed' | 'pending'; error?: string; recordFound?: string };
    spf: { status: 'success' | 'failed' | 'pending'; error?: string; recordFound?: string };
    dkim: { status: 'success' | 'failed' | 'pending'; error?: string; recordFound?: string };
    dmarc: { status: 'success' | 'failed' | 'pending'; error?: string; recordFound?: string };
  };
  overallStatus: 'verified' | 'failed' | 'partial' | 'pending';
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  retryCount?: number;
  isAutomatedVerification?: boolean;
  jobId?: string;
}

export interface DomainVerificationStats {
  totalAttempts: number;
  successfulVerifications: number;
  failedVerifications: number;
  partialVerifications: number;
  averageVerificationTime: number;
  commonErrors: { error: string; count: number }[];
  verificationsByHour: { hour: number; count: number }[];
  retryRates: { retryCount: number; percentage: number }[];
}

export class DomainVerificationLogger {
  private static instance: DomainVerificationLogger;
  
  public static getInstance(): DomainVerificationLogger {
    if (!DomainVerificationLogger.instance) {
      DomainVerificationLogger.instance = new DomainVerificationLogger();
    }
    return DomainVerificationLogger.instance;
  }

  constructor() {
    // Tables are now created via migrations
  }


  // Log início da verificação de domínio
  public async logVerificationStart(domainId: number, domainName: string, options: {
    userId?: number;
    verificationToken?: string;
    isAutomatedVerification?: boolean;
    jobId?: string;
    retryCount?: number;
  } = {}): Promise<number> {
    try {
      const verificationAttempt: Partial<DomainVerificationAttempt> = {
        domainId,
        domainName,
        userId: options.userId,
        verificationToken: options.verificationToken,
        attempts: {
          ownership: { status: 'pending' },
          spf: { status: 'pending' },
          dkim: { status: 'pending' },
          dmarc: { status: 'pending' }
        },
        overallStatus: 'pending',
        startTime: new Date(),
        retryCount: options.retryCount || 0,
        isAutomatedVerification: options.isAutomatedVerification || false,
        jobId: options.jobId
      };

      const [logId] = await db('domain_verification_logs').insert({
        domain_id: verificationAttempt.domainId,
        domain_name: verificationAttempt.domainName,
        user_id: verificationAttempt.userId,
        verification_token: verificationAttempt.verificationToken,
        attempts: JSON.stringify(verificationAttempt.attempts),
        overall_status: verificationAttempt.overallStatus,
        start_time: verificationAttempt.startTime,
        retry_count: verificationAttempt.retryCount,
        is_automated: verificationAttempt.isAutomatedVerification,
        job_id: verificationAttempt.jobId
      });

      // Log estruturado
      Logger.business('domain_verification', 'verification_started', {
        entityId: domainId.toString(),
        userId: options.userId?.toString(),
        metadata: {
          domainName,
          logId,
          isAutomated: options.isAutomatedVerification,
          retryCount: options.retryCount,
          jobId: options.jobId
        }
      });

      return logId;
    } catch (error) {
      Logger.error('Failed to log domain verification start', error as Error, {
        context: { domainId, domainName, options }
      });
      throw error;
    }
  }

  // Log resultado individual de verificação (SPF, DKIM, etc.)
  public async logVerificationStep(logId: number, step: 'ownership' | 'spf' | 'dkim' | 'dmarc', result: {
    status: 'success' | 'failed';
    error?: string;
    recordFound?: string;
    duration?: number;
  }): Promise<void> {
    try {
      // Buscar log atual
      const currentLog = await db('domain_verification_logs').where('id', logId).first();
      if (!currentLog) {
        throw new Error(`Verification log with ID ${logId} not found`);
      }

      const attempts = JSON.parse(currentLog.attempts);
      attempts[step] = {
        status: result.status,
        error: result.error,
        recordFound: result.recordFound,
        verifiedAt: new Date(),
        duration: result.duration
      };

      // Atualizar o log
      await db('domain_verification_logs')
        .where('id', logId)
        .update({
          attempts: JSON.stringify(attempts),
          updated_at: new Date()
        });

      // Log estruturado do passo
      const level = result.status === 'success' ? 'info' : 'warn';
      logger[level](`Domain verification step: ${step}`, {
        business: {
          entity: 'domain_verification',
          action: `${step}_verification_${result.status}`,
          entityId: currentLog.domain_id.toString(),
          metadata: {
            domainName: currentLog.domain_name,
            step,
            status: result.status,
            error: result.error,
            recordFound: result.recordFound,
            duration: result.duration,
            logId
          }
        }
      });
    } catch (error) {
      Logger.error(`Failed to log domain verification step: ${step}`, error as Error, {
        context: { logId, step, result }
      });
    }
  }

  // Log conclusão da verificação completa
  public async logVerificationComplete(logId: number, options: {
    overallStatus: 'verified' | 'failed' | 'partial';
    errorSummary?: string;
    totalDuration?: number;
  }): Promise<void> {
    try {
      const endTime = new Date();
      
      await db('domain_verification_logs')
        .where('id', logId)
        .update({
          overall_status: options.overallStatus,
          end_time: endTime,
          total_duration: options.totalDuration,
          error_summary: options.errorSummary,
          updated_at: endTime
        });

      // Buscar o log atualizado para logging
      const completedLog = await db('domain_verification_logs').where('id', logId).first();
      if (!completedLog) {
        throw new Error(`Verification log with ID ${logId} not found`);
      }

      // Log estruturado da conclusão
      const level = options.overallStatus === 'verified' ? 'info' : 'warn';
      logger[level](`Domain verification completed: ${options.overallStatus}`, {
        business: {
          entity: 'domain_verification',
          action: `verification_${options.overallStatus}`,
          entityId: completedLog.domain_id.toString(),
          metadata: {
            domainName: completedLog.domain_name,
            overallStatus: options.overallStatus,
            totalDuration: options.totalDuration,
            errorSummary: options.errorSummary,
            isAutomated: completedLog.is_automated,
            retryCount: completedLog.retry_count,
            logId
          }
        },
        performance: {
          responseTime: options.totalDuration || 0,
          memoryUsage: process.memoryUsage()
        }
      });

      // Atualizar métricas diárias
      await this.updateDailyMetrics(completedLog);
    } catch (error) {
      Logger.error('Failed to log domain verification completion', error as Error, {
        context: { logId, options }
      });
    }
  }

  // Atualizar métricas diárias
  private async updateDailyMetrics(completedLog: any): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const hour = new Date().getHours();

      // Buscar métricas existentes do dia
      let metrics = await db('domain_verification_metrics')
        .where('metric_date', today)
        .first();

      if (!metrics) {
        // Criar nova entrada de métricas
        await db('domain_verification_metrics').insert({
          metric_date: today,
          total_attempts: 1,
          successful_verifications: completedLog.overall_status === 'verified' ? 1 : 0,
          failed_verifications: completedLog.overall_status === 'failed' ? 1 : 0,
          partial_verifications: completedLog.overall_status === 'partial' ? 1 : 0,
          average_verification_time: completedLog.total_duration ? completedLog.total_duration / 1000 : 0,
          common_errors: JSON.stringify([]),
          hourly_distribution: JSON.stringify([{ hour, count: 1 }]),
          retry_statistics: JSON.stringify([{ retryCount: completedLog.retry_count, count: 1 }])
        });
      } else {
        // Atualizar métricas existentes
        const hourlyDist = JSON.parse(metrics.hourly_distribution || '[]');
        const retryStats = JSON.parse(metrics.retry_statistics || '[]');

        // Atualizar distribuição por hora
        const hourEntry = hourlyDist.find((h: any) => h.hour === hour);
        if (hourEntry) {
          hourEntry.count++;
        } else {
          hourlyDist.push({ hour, count: 1 });
        }

        // Atualizar estatísticas de retry
        const retryEntry = retryStats.find((r: any) => r.retryCount === completedLog.retry_count);
        if (retryEntry) {
          retryEntry.count++;
        } else {
          retryStats.push({ retryCount: completedLog.retry_count, count: 1 });
        }

        // Calcular nova média de tempo de verificação
        const newAverage = ((metrics.average_verification_time * metrics.total_attempts) + 
                          (completedLog.total_duration ? completedLog.total_duration / 1000 : 0)) / 
                          (metrics.total_attempts + 1);

        await db('domain_verification_metrics')
          .where('metric_date', today)
          .update({
            total_attempts: metrics.total_attempts + 1,
            successful_verifications: metrics.successful_verifications + 
              (completedLog.overall_status === 'verified' ? 1 : 0),
            failed_verifications: metrics.failed_verifications + 
              (completedLog.overall_status === 'failed' ? 1 : 0),
            partial_verifications: metrics.partial_verifications + 
              (completedLog.overall_status === 'partial' ? 1 : 0),
            average_verification_time: newAverage,
            hourly_distribution: JSON.stringify(hourlyDist),
            retry_statistics: JSON.stringify(retryStats),
            updated_at: new Date()
          });
      }
    } catch (error) {
      Logger.error('Failed to update daily verification metrics', error as Error, {
        context: { completedLog }
      });
    }
  }

  // Obter estatísticas de verificação
  public async getVerificationStats(options: {
    domainId?: number;
    userId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    isAutomated?: boolean;
  } = {}): Promise<DomainVerificationStats> {
    try {
      let query = db('domain_verification_logs').whereNotNull('end_time');

      if (options.domainId) {
        query = query.where('domain_id', options.domainId);
      }
      if (options.userId) {
        query = query.where('user_id', options.userId);
      }
      if (options.dateFrom) {
        query = query.where('start_time', '>=', options.dateFrom);
      }
      if (options.dateTo) {
        query = query.where('start_time', '<=', options.dateTo);
      }
      if (options.isAutomated !== undefined) {
        query = query.where('is_automated', options.isAutomated);
      }

      const logs = await query.select('*');

      const stats: DomainVerificationStats = {
        totalAttempts: logs.length,
        successfulVerifications: logs.filter(l => l.overall_status === 'verified').length,
        failedVerifications: logs.filter(l => l.overall_status === 'failed').length,
        partialVerifications: logs.filter(l => l.overall_status === 'partial').length,
        averageVerificationTime: 0,
        commonErrors: [],
        verificationsByHour: [],
        retryRates: []
      };

      if (logs.length > 0) {
        // Calcular tempo médio
        const totalTime = logs.reduce((sum, log) => sum + (log.total_duration || 0), 0);
        stats.averageVerificationTime = totalTime / logs.length / 1000; // em segundos

        // Distribuição por hora
        const hourCounts = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
        logs.forEach(log => {
          const hour = new Date(log.start_time).getHours();
          hourCounts[hour].count++;
        });
        stats.verificationsByHour = hourCounts.filter(h => h.count > 0);

        // Taxa de retry
        const retryCounts: { [key: number]: number } = {};
        logs.forEach(log => {
          const retryCount = log.retry_count || 0;
          retryCounts[retryCount] = (retryCounts[retryCount] || 0) + 1;
        });
        
        stats.retryRates = Object.entries(retryCounts).map(([retryCount, count]) => ({
          retryCount: parseInt(retryCount),
          percentage: (count / logs.length) * 100
        }));

        // Erros comuns
        const errorCounts: { [key: string]: number } = {};
        logs.forEach(log => {
          if (log.error_summary) {
            errorCounts[log.error_summary] = (errorCounts[log.error_summary] || 0) + 1;
          }
        });

        stats.commonErrors = Object.entries(errorCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([error, count]) => ({ error, count }));
      }

      return stats;
    } catch (error) {
      Logger.error('Failed to get domain verification stats', error as Error, {
        context: { options }
      });
      throw error;
    }
  }

  // Obter logs recentes de verificação
  public async getRecentVerificationLogs(options: {
    limit?: number;
    domainId?: number;
    userId?: number;
    status?: 'verified' | 'failed' | 'partial' | 'pending';
    isAutomated?: boolean;
  } = {}): Promise<any[]> {
    try {
      let query = db('domain_verification_logs')
        .orderBy('start_time', 'desc')
        .limit(options.limit || 50);

      if (options.domainId) {
        query = query.where('domain_id', options.domainId);
      }
      if (options.userId) {
        query = query.where('user_id', options.userId);
      }
      if (options.status) {
        query = query.where('overall_status', options.status);
      }
      if (options.isAutomated !== undefined) {
        query = query.where('is_automated', options.isAutomated);
      }

      const logs = await query.select('*');

      return logs.map(log => ({
        ...log,
        attempts: JSON.parse(log.attempts)
      }));
    } catch (error) {
      Logger.error('Failed to get recent verification logs', error as Error, {
        context: { options }
      });
      throw error;
    }
  }

  // Alertas para problemas recorrentes
  public async checkForRecurringIssues(): Promise<{
    highFailureRate: boolean;
    stuckPendingVerifications: number;
    unusualRetryRates: boolean;
    alerts: string[];
  }> {
    try {
      const alerts: string[] = [];
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Verificar taxa de falha nas últimas 24h
      const recentLogs = await db('domain_verification_logs')
        .where('start_time', '>=', last24Hours)
        .whereNotNull('end_time');

      const failureRate = recentLogs.length > 0 ? 
        recentLogs.filter(l => l.overall_status === 'failed').length / recentLogs.length : 0;

      const highFailureRate = failureRate > 0.5; // 50% de falha
      if (highFailureRate) {
        alerts.push(`Alta taxa de falha: ${(failureRate * 100).toFixed(1)}% nas últimas 24h`);
      }

      // Verificações pendentes há mais de 1 hora
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const stuckPendingResult = await db('domain_verification_logs')
        .where('overall_status', 'pending')
        .where('start_time', '<=', oneHourAgo)
        .count('id as count')
        .first();

      const stuckPendingVerifications = parseInt(stuckPendingResult?.count as string) || 0;
      if (stuckPendingVerifications > 0) {
        alerts.push(`${stuckPendingVerifications} verificações pendentes há mais de 1 hora`);
      }

      // Taxa de retry incomum (mais de 80% das verificações precisando retry)
      const retryRate = recentLogs.length > 0 ?
        recentLogs.filter(l => (l.retry_count || 0) > 0).length / recentLogs.length : 0;

      const unusualRetryRates = retryRate > 0.8;
      if (unusualRetryRates) {
        alerts.push(`Taxa de retry elevada: ${(retryRate * 100).toFixed(1)}% nas últimas 24h`);
      }

      // Log dos alertas
      if (alerts.length > 0) {
        Logger.security('domain_verification_alert', 'failure', {
          reason: `Problemas recorrentes detectados: ${alerts.join(', ')}`,
          riskLevel: 'medium',
          resource: 'domain_verification'
        });
      }

      return {
        highFailureRate,
        stuckPendingVerifications,
        unusualRetryRates,
        alerts
      };
    } catch (error) {
      Logger.error('Failed to check for recurring verification issues', error as Error);
      return {
        highFailureRate: false,
        stuckPendingVerifications: 0,
        unusualRetryRates: false,
        alerts: ['Erro ao verificar problemas recorrentes']
      };
    }
  }

  // Limpeza de logs antigos
  public async cleanupOldLogs(retentionDays: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const deletedLogsCount = await db('domain_verification_logs')
        .where('start_time', '<=', cutoffDate)
        .del();

      const deletedMetricsCount = await db('domain_verification_metrics')
        .where('metric_date', '<=', cutoffDate.toISOString().split('T')[0])
        .del();

      logger.info('Domain verification logs cleanup completed', {
        business: {
          entity: 'domain_verification',
          action: 'logs_cleanup',
          metadata: {
            retentionDays,
            deletedLogsCount,
            deletedMetricsCount,
            cutoffDate
          }
        }
      });
    } catch (error) {
      Logger.error('Failed to cleanup old domain verification logs', error as Error, {
        context: { retentionDays }
      });
    }
  }
}

// Export singleton instance
export const domainVerificationLogger = DomainVerificationLogger.getInstance();