import { logger } from '../config/logger';
import db from '../config/database';
import { MultiDomainDKIMManager } from './MultiDomainDKIMManager';

/**
 * Professional DKIM Health Monitoring System
 * 
 * Monitors DKIM configuration health across all domains
 * Provides detailed reporting and diagnostics
 * Does NOT auto-fix issues (professional separation of concerns)
 */

export interface DKIMHealthReport {
  timestamp: Date;
  totalDomains: number;
  healthyDomains: number;
  unhealthyDomains: number;
  criticalIssues: number;
  summary: {
    healthy: DomainHealthStatus[];
    unhealthy: DomainHealthStatus[];
    critical: DomainHealthStatus[];
  };
  recommendations: string[];
  systemStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface DomainHealthStatus {
  domainId: number;
  domainName: string;
  userId: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  issues: DomainIssue[];
  lastChecked: Date;
  dkimConfig?: {
    exists: boolean;
    hasPrivateKey: boolean;
    hasPublicKey: boolean;
    keyLength?: number;
    selector?: string;
  };
}

export interface DomainIssue {
  type: 'MISSING_DKIM' | 'INVALID_KEYS' | 'CORRUPTED_DATA' | 'DATABASE_INCONSISTENCY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  recommendation: string;
  affectedEmails?: number;
}

export class DKIMHealthChecker {
  private readonly dkimManager: MultiDomainDKIMManager;
  
  constructor() {
    this.dkimManager = new MultiDomainDKIMManager();
    logger.info('✅ DKIMHealthChecker initialized - Professional monitoring system active');
  }

  /**
   * Executa verificação completa de saúde DKIM em todos os domínios
   */
  async performFullHealthCheck(): Promise<DKIMHealthReport> {
    const startTime = Date.now();
    logger.info('🔍 Starting comprehensive DKIM health check...');

    try {
      // Buscar todos os domínios cadastrados
      const allDomains = await db('domains')
        .select('id', 'domain_name', 'user_id', 'is_verified', 'dkim_enabled', 'created_at', 'updated_at')
        .orderBy('created_at', 'desc');

      logger.info(`📊 Found ${allDomains.length} domains to analyze`);

      // Analisar cada domínio
      const domainHealthStatuses = await Promise.all(
        allDomains.map(domain => this.analyzeDomainHealth(domain))
      );

      // Calcular métricas agregadas
      const healthyDomains = domainHealthStatuses.filter(d => d.status === 'HEALTHY');
      const unhealthyDomains = domainHealthStatuses.filter(d => d.status === 'WARNING');
      const criticalDomains = domainHealthStatuses.filter(d => d.status === 'CRITICAL');

      // Determinar status geral do sistema
      const systemStatus = this.calculateSystemStatus(healthyDomains.length, unhealthyDomains.length, criticalDomains.length);

      // Gerar recomendações
      const recommendations = this.generateRecommendations(domainHealthStatuses);

      const report: DKIMHealthReport = {
        timestamp: new Date(),
        totalDomains: allDomains.length,
        healthyDomains: healthyDomains.length,
        unhealthyDomains: unhealthyDomains.length,
        criticalIssues: criticalDomains.length,
        summary: {
          healthy: healthyDomains,
          unhealthy: unhealthyDomains,
          critical: criticalDomains
        },
        recommendations,
        systemStatus
      };

      const duration = Date.now() - startTime;
      logger.info('✅ DKIM health check completed', {
        duration: `${duration}ms`,
        totalDomains: allDomains.length,
        healthyDomains: healthyDomains.length,
        unhealthyDomains: unhealthyDomains.length,
        criticalIssues: criticalDomains.length,
        systemStatus,
        recommendationsCount: recommendations.length
      });

      return report;

    } catch (error) {
      logger.error('❌ DKIM health check failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Analisa a saúde de um domínio específico
   */
  private async analyzeDomainHealth(domain: any): Promise<DomainHealthStatus> {
    const issues: DomainIssue[] = [];
    let dkimConfig: DomainHealthStatus['dkimConfig'] = { exists: false, hasPrivateKey: false, hasPublicKey: false };

    try {
      // 1. Verificar se DKIM existe na tabela dkim_keys
      const dkimRecord = await db('dkim_keys')
        .where('domain_id', domain.id)
        .first();

      if (!dkimRecord) {
        issues.push({
          type: 'MISSING_DKIM',
          severity: 'CRITICAL',
          description: `DKIM configuration missing for domain ${domain.domain_name}`,
          recommendation: `Run DKIM generation for domain ID ${domain.id} using DomainSetupService.generateDKIMKeysForDomain()`
        });
      } else {
        dkimConfig = {
          exists: true,
          hasPrivateKey: !!dkimRecord.private_key,
          hasPublicKey: !!dkimRecord.public_key,
          keyLength: dkimRecord.private_key?.length || 0,
          selector: dkimRecord.selector
        };

        // 2. Verificar integridade das chaves
        if (!dkimRecord.private_key || !dkimRecord.public_key) {
          issues.push({
            type: 'INVALID_KEYS',
            severity: 'CRITICAL',
            description: `DKIM keys are missing or empty for domain ${domain.domain_name}`,
            recommendation: `Regenerate DKIM keys using MultiDomainDKIMManager.regenerateDKIMKeysForDomain('${domain.domain_name}')`
          });
        } else if (dkimRecord.private_key.length < 100 || dkimRecord.public_key.length < 100) {
          issues.push({
            type: 'CORRUPTED_DATA',
            severity: 'HIGH',
            description: `DKIM keys appear to be corrupted (too short) for domain ${domain.domain_name}`,
            recommendation: `Regenerate DKIM keys - current key lengths: private=${dkimRecord.private_key.length}, public=${dkimRecord.public_key.length}`
          });
        }

        // 3. Verificar consistência do seletor
        if (!dkimRecord.selector || dkimRecord.selector !== 'default') {
          issues.push({
            type: 'DATABASE_INCONSISTENCY',
            severity: 'MEDIUM',
            description: `DKIM selector is not standard for domain ${domain.domain_name} (found: '${dkimRecord.selector}')`,
            recommendation: `Verify DKIM selector consistency - expected 'default', found '${dkimRecord.selector}'`
          });
        }
      }

      // 4. Verificar se domínio está habilitado para DKIM mas não tem configuração
      if (domain.dkim_enabled && (!dkimRecord || !dkimRecord.private_key)) {
        issues.push({
          type: 'DATABASE_INCONSISTENCY',
          severity: 'HIGH',
          description: `Domain ${domain.domain_name} is marked as DKIM enabled but has no valid DKIM configuration`,
          recommendation: `Either disable DKIM for domain or generate proper DKIM configuration`
        });
      }

    } catch (error) {
      issues.push({
        type: 'DATABASE_INCONSISTENCY',
        severity: 'CRITICAL',
        description: `Database error while checking domain ${domain.domain_name}: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: `Check database connectivity and table integrity`
      });
    }

    // Determinar status geral do domínio
    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = issues.filter(i => i.severity === 'HIGH');
    
    let status: DomainHealthStatus['status'];
    if (criticalIssues.length > 0) {
      status = 'CRITICAL';
    } else if (highIssues.length > 0) {
      status = 'WARNING';
    } else {
      status = 'HEALTHY';
    }

    return {
      domainId: domain.id,
      domainName: domain.domain_name,
      userId: domain.user_id,
      status,
      issues,
      lastChecked: new Date(),
      dkimConfig
    };
  }

  /**
   * Calcula o status geral do sistema
   */
  private calculateSystemStatus(healthy: number, warning: number, critical: number): DKIMHealthReport['systemStatus'] {
    const total = healthy + warning + critical;
    
    if (critical > 0) {
      return 'CRITICAL';
    } else if (warning > total * 0.3) { // Mais de 30% com problemas
      return 'WARNING';
    } else {
      return 'HEALTHY';
    }
  }

  /**
   * Gera recomendações baseadas nos problemas encontrados
   */
  private generateRecommendations(domainStatuses: DomainHealthStatus[]): string[] {
    const recommendations: string[] = [];
    
    const missingDkimDomains = domainStatuses.filter(d => 
      d.issues.some(i => i.type === 'MISSING_DKIM')
    );
    
    const corruptedDomains = domainStatuses.filter(d => 
      d.issues.some(i => i.type === 'INVALID_KEYS' || i.type === 'CORRUPTED_DATA')
    );

    if (missingDkimDomains.length > 0) {
      recommendations.push(
        `CRITICAL: ${missingDkimDomains.length} domains are missing DKIM configuration. ` +
        `Run the DKIMMigrationService to generate missing keys.`
      );
    }

    if (corruptedDomains.length > 0) {
      recommendations.push(
        `HIGH PRIORITY: ${corruptedDomains.length} domains have corrupted DKIM keys. ` +
        `Regenerate DKIM keys for these domains immediately.`
      );
    }

    if (domainStatuses.length > 10 && missingDkimDomains.length > 3) {
      recommendations.push(
        `SYSTEM IMPROVEMENT: Consider implementing automated DKIM generation ` +
        `in the domain creation process to prevent future issues.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All domains have healthy DKIM configurations. System is operating normally.');
    }

    return recommendations;
  }

  /**
   * Verifica saúde de um domínio específico
   */
  async checkDomainHealth(domainName: string): Promise<DomainHealthStatus | null> {
    try {
      const domain = await db('domains')
        .where('domain_name', domainName)
        .first();

      if (!domain) {
        logger.warn(`Domain not found: ${domainName}`);
        return null;
      }

      return await this.analyzeDomainHealth(domain);

    } catch (error) {
      logger.error('Failed to check domain health', {
        domainName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Exporta relatório em formato JSON para análise externa
   */
  async exportHealthReport(): Promise<string> {
    const report = await this.performFullHealthCheck();
    
    // Relatório simplificado para export
    const exportData = {
      timestamp: report.timestamp,
      summary: {
        totalDomains: report.totalDomains,
        healthyDomains: report.healthyDomains,
        unhealthyDomains: report.unhealthyDomains,
        criticalIssues: report.criticalIssues,
        systemStatus: report.systemStatus
      },
      criticalDomains: report.summary.critical.map(d => ({
        domainName: d.domainName,
        issues: d.issues.map(i => ({
          type: i.type,
          severity: i.severity,
          description: i.description
        }))
      })),
      recommendations: report.recommendations
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Export singleton instance
export const dkimHealthChecker = new DKIMHealthChecker();