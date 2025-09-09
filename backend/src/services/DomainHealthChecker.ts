import { logger } from '../config/logger';
import db from '../config/database';
import { DomainSetupService } from './DomainSetupService';
// import { AlertingService } from './AlertingService'; // TODO: Implementar AlertingService

export interface DomainHealthStatus {
  domainId: number;
  domainName: string;
  userId: number;
  wasVerified: boolean;
  isStillVerified: boolean;
  lastChecked: Date;
  errorDetails?: any;
}

/**
 * Serviço para verificação periódica da saúde DNS dos domínios
 * CORREÇÃO CRÍTICA: Re-validar domínios e desativar se DNS parar de funcionar
 */
export class DomainHealthChecker {
  private static instance: DomainHealthChecker;
  private domainSetupService: DomainSetupService;
  // private alertingService: AlertingService; // TODO: Implementar AlertingService
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.domainSetupService = new DomainSetupService();
    // this.alertingService = AlertingService.getInstance(); // TODO: Implementar AlertingService
    logger.info('🔧 DomainHealthChecker initialized - DNS monitoring active');
  }

  public static getInstance(): DomainHealthChecker {
    if (!DomainHealthChecker.instance) {
      DomainHealthChecker.instance = new DomainHealthChecker();
    }
    return DomainHealthChecker.instance;
  }

  /**
   * Inicia monitoramento automático de saúde DNS
   * 
   * @param intervalMinutes - Intervalo em minutos entre verificações (padrão: 60)
   */
  startHealthMonitoring(intervalMinutes: number = 60): void {
    if (this.healthCheckInterval) {
      logger.warn('Health monitoring already running');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    
    logger.info('🚀 Starting DNS Health Monitoring', {
      intervalMinutes,
      intervalMs,
      nextCheck: new Date(Date.now() + intervalMs)
    });

    // Executar verificação imediata
    this.runHealthCheck().catch(error => {
      logger.error('Initial health check failed', { error });
    });

    // Configurar verificações periódicas
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch(error => {
        logger.error('Scheduled health check failed', { error });
      });
    }, intervalMs);
  }

  /**
   * Para o monitoramento automático
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('🛑 DNS Health Monitoring stopped');
    }
  }

  /**
   * Executa verificação de saúde de todos os domínios verificados
   * 
   * @returns Promise<DomainHealthStatus[]> - Status de saúde de cada domínio
   */
  async runHealthCheck(): Promise<DomainHealthStatus[]> {
    try {
      logger.info('🔍 Running DNS Health Check for all verified domains');

      // Buscar todos os domínios marcados como verificados
      const verifiedDomains = await db('domains')
        .select('*')
        .where('is_verified', true)
        .orderBy('user_id', 'asc');

      logger.info('📋 Found domains to check', {
        count: verifiedDomains.length,
        domains: verifiedDomains.map(d => d.domain_name)
      });

      const results: DomainHealthStatus[] = [];
      let unhealthyCount = 0;
      let reValidatedCount = 0;

      // Verificar cada domínio
      for (const domain of verifiedDomains) {
        try {
          logger.debug('🔍 Checking domain health', {
            domainId: domain.id,
            domainName: domain.domain_name,
            userId: domain.user_id
          });

          // Re-verificar DNS
          const healthResult = await this.domainSetupService.verifyDomainSetup(
            domain.user_id, 
            domain.id
          );

          const healthStatus: DomainHealthStatus = {
            domainId: domain.id,
            domainName: domain.domain_name,
            userId: domain.user_id,
            wasVerified: domain.is_verified,
            isStillVerified: healthResult.all_passed,
            lastChecked: new Date()
          };

          // Se o domínio falhou na re-verificação
          if (!healthResult.all_passed) {
            unhealthyCount++;
            healthStatus.errorDetails = healthResult.results;

            logger.warn('🚨 Domain health check FAILED', {
              domainId: domain.id,
              domainName: domain.domain_name,
              userId: domain.user_id,
              errors: Object.entries(healthResult.results)
                .filter(([_, result]) => !result.valid)
                .map(([type, result]) => `${type}: ${result.error}`)
            });

            // Marcar domínio como não verificado
            await this.markDomainAsUnverified(domain.id, healthResult.results);

            // Alertar usuário
            await this.alertUserAboutDomainIssue(domain, healthResult);

          } else {
            reValidatedCount++;
            logger.debug('✅ Domain health check PASSED', {
              domainId: domain.id,
              domainName: domain.domain_name
            });
          }

          results.push(healthStatus);

          // Pequena pausa entre verificações para não sobrecarregar DNS
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          logger.error('Error checking individual domain health', {
            domainId: domain.id,
            domainName: domain.domain_name,
            error: error instanceof Error ? error.message : String(error)
          });

          results.push({
            domainId: domain.id,
            domainName: domain.domain_name,
            userId: domain.user_id,
            wasVerified: domain.is_verified,
            isStillVerified: false,
            lastChecked: new Date(),
            errorDetails: error instanceof Error ? error.message : String(error)
          });
        }
      }

      logger.info('🏁 DNS Health Check completed', {
        totalChecked: verifiedDomains.length,
        stillHealthy: reValidatedCount,
        nowUnhealthy: unhealthyCount,
        successRate: `${((reValidatedCount / verifiedDomains.length) * 100).toFixed(1)}%`
      });

      // Log resumo para alertas
      if (unhealthyCount > 0) {
        // TODO: Implementar sistema de alertas
        logger.warn('🚨 SYSTEM ALERT: Domain health degraded', {
          unhealthyCount,
          totalChecked: verifiedDomains.length,
          successRate: ((reValidatedCount / verifiedDomains.length) * 100).toFixed(1) + '%',
          unhealthyDomains: results
            .filter(r => !r.isStillVerified)
            .map(r => r.domainName)
        });
      }

      return results;

    } catch (error) {
      logger.error('❌ DNS Health Check failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Marca um domínio como não verificado devido a falha no DNS
   * 
   * @param domainId - ID do domínio
   * @param dnsResults - Resultados da verificação DNS
   */
  private async markDomainAsUnverified(domainId: number, dnsResults: any): Promise<void> {
    try {
      await db('domains')
        .where('id', domainId)
        .update({
          is_verified: false,
          verification_status: 'failed',
          updated_at: new Date()
        });

      logger.warn('🔄 Domain marked as unverified due to DNS failure', {
        domainId,
        dnsResults
      });

      // Registrar evento de auditoria
      await db('audit_logs').insert({
        user_id: null,
        action: 'domain_health_check_failed',
        resource_type: 'domain',
        resource_id: domainId,
        details: JSON.stringify({
          reason: 'DNS health check failure',
          dnsResults,
          timestamp: new Date()
        }),
        timestamp: new Date()
      });

    } catch (error) {
      logger.error('Error marking domain as unverified', {
        domainId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Alerta usuário sobre problema com domínio
   * 
   * @param domain - Registro do domínio
   * @param healthResult - Resultado da verificação
   */
  private async alertUserAboutDomainIssue(domain: any, healthResult: any): Promise<void> {
    try {
      const user = await db('users').where('id', domain.user_id).first();
      
      if (!user) {
        logger.warn('User not found for domain alert', { 
          userId: domain.user_id, 
          domainId: domain.id 
        });
        return;
      }

      const failedChecks = Object.entries(healthResult.results)
        .filter(([_, result]: any) => !result.valid)
        .map(([type, result]: any) => `${type.toUpperCase()}: ${result.error}`);

      logger.info('📧 Alerting user about domain DNS issues', {
        userId: user.id,
        userEmail: user.email,
        domainName: domain.domain_name,
        failedChecks
      });

      // TODO: Implementar sistema de alertas para usuário
      logger.warn('🚨 USER ALERT: Domain DNS failed', {
        userId: user.id,
        userEmail: user.email,
        domainId: domain.id,
        domainName: domain.domain_name,
        failedChecks,
        actionRequired: 'Please check your DNS configuration and re-verify the domain'
      });

    } catch (error) {
      logger.error('Error alerting user about domain issue', {
        domainId: domain.id,
        userId: domain.user_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Verifica a saúde de um domínio específico
   * 
   * @param domainId - ID do domínio
   * @returns Promise<DomainHealthStatus> - Status de saúde do domínio
   */
  async checkSingleDomain(domainId: number): Promise<DomainHealthStatus | null> {
    try {
      const domain = await db('domains').where('id', domainId).first();
      
      if (!domain) {
        logger.warn('Domain not found for health check', { domainId });
        return null;
      }

      const healthResult = await this.domainSetupService.verifyDomainSetup(
        domain.user_id, 
        domain.id
      );

      const healthStatus: DomainHealthStatus = {
        domainId: domain.id,
        domainName: domain.domain_name,
        userId: domain.user_id,
        wasVerified: domain.is_verified,
        isStillVerified: healthResult.all_passed,
        lastChecked: new Date()
      };

      if (!healthResult.all_passed) {
        healthStatus.errorDetails = healthResult.results;
        await this.markDomainAsUnverified(domain.id, healthResult.results);
        await this.alertUserAboutDomainIssue(domain, healthResult);
      }

      return healthStatus;

    } catch (error) {
      logger.error('Error checking single domain health', {
        domainId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}

// Export singleton instance for easy import
export const domainHealthChecker = DomainHealthChecker.getInstance();