import { logger } from '../config/logger';
import db from '../config/database';
import { DomainSetupService } from './DomainSetupService';
import { dkimHealthChecker, DomainHealthStatus } from './DKIMHealthChecker';

/**
 * Professional DKIM Migration Service
 * 
 * Safely migrates existing domains to ensure they have proper DKIM configuration
 * Uses atomic transactions and comprehensive validation
 * Provides detailed reporting and rollback capabilities
 */

export interface MigrationResult {
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  totalDomains: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  details: DomainMigrationResult[];
  summary: {
    criticalIssuesFixed: number;
    newDkimKeysGenerated: number;
    corruptedKeysReplaced: number;
    errorsEncountered: string[];
  };
}

export interface DomainMigrationResult {
  domainId: number;
  domainName: string;
  userId: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  action: 'GENERATED_NEW' | 'FIXED_CORRUPTED' | 'ALREADY_HEALTHY' | 'ERROR';
  details: string;
  durationMs: number;
  error?: string;
}

export class DKIMMigrationService {
  private readonly domainSetupService: DomainSetupService;
  
  constructor() {
    this.domainSetupService = new DomainSetupService();
    logger.info('✅ DKIMMigrationService initialized - Professional migration system ready');
  }

  /**
   * Executa migração completa de DKIM para todos os domínios
   * 
   * @param dryRun - Se true, apenas reporta o que seria feito sem executar mudanças
   * @param forceRegeneration - Se true, regenera DKIM mesmo para domínios saudáveis
   */
  async migrateAllDomains(
    dryRun: boolean = false, 
    forceRegeneration: boolean = false
  ): Promise<MigrationResult> {
    const startTime = new Date();
    logger.info('🚀 Starting DKIM migration process', { dryRun, forceRegeneration });

    try {
      // 1. Executar health check para identificar problemas
      const healthReport = await dkimHealthChecker.performFullHealthCheck();
      
      logger.info('📊 Health check completed before migration', {
        totalDomains: healthReport.totalDomains,
        healthyDomains: healthReport.healthyDomains,
        unhealthyDomains: healthReport.unhealthyDomains,
        criticalIssues: healthReport.criticalIssues
      });

      // 2. Identificar domínios que precisam de migração
      const domainsToMigrate = [
        ...healthReport.summary.critical,
        ...healthReport.summary.unhealthy,
        ...(forceRegeneration ? healthReport.summary.healthy : [])
      ];

      if (domainsToMigrate.length === 0) {
        logger.info('✅ No domains require migration - all are healthy');
        
        return {
          success: true,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          totalDomains: healthReport.totalDomains,
          processed: 0,
          successful: 0,
          failed: 0,
          skipped: healthReport.totalDomains,
          details: [],
          summary: {
            criticalIssuesFixed: 0,
            newDkimKeysGenerated: 0,
            corruptedKeysReplaced: 0,
            errorsEncountered: []
          }
        };
      }

      logger.info(`🔧 Found ${domainsToMigrate.length} domains requiring migration`, {
        critical: healthReport.summary.critical.length,
        unhealthy: healthReport.summary.unhealthy.length,
        forceRegeneration: forceRegeneration ? healthReport.summary.healthy.length : 0
      });

      // 3. Executar migração para cada domínio
      const migrationResults: DomainMigrationResult[] = [];
      let successful = 0;
      let failed = 0;

      for (const domainHealth of domainsToMigrate) {
        const result = await this.migrateSingleDomain(domainHealth, dryRun);
        migrationResults.push(result);

        if (result.status === 'SUCCESS') {
          successful++;
        } else if (result.status === 'FAILED') {
          failed++;
        }

        // Delay entre migrações para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 4. Calcular estatísticas finais
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      const summary = {
        criticalIssuesFixed: migrationResults.filter(r => 
          r.status === 'SUCCESS' && r.action === 'GENERATED_NEW'
        ).length,
        newDkimKeysGenerated: migrationResults.filter(r => 
          r.action === 'GENERATED_NEW'
        ).length,
        corruptedKeysReplaced: migrationResults.filter(r => 
          r.action === 'FIXED_CORRUPTED'
        ).length,
        errorsEncountered: migrationResults
          .filter(r => r.error)
          .map(r => `${r.domainName}: ${r.error}`)
      };

      const migrationResult: MigrationResult = {
        success: failed === 0,
        startTime,
        endTime,
        duration,
        totalDomains: healthReport.totalDomains,
        processed: domainsToMigrate.length,
        successful,
        failed,
        skipped: healthReport.totalDomains - domainsToMigrate.length,
        details: migrationResults,
        summary
      };

      logger.info('✅ DKIM migration completed', {
        dryRun,
        duration: `${duration}ms`,
        totalProcessed: domainsToMigrate.length,
        successful,
        failed,
        criticalIssuesFixed: summary.criticalIssuesFixed
      });

      return migrationResult;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      logger.error('❌ DKIM migration failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`
      });

      throw error;
    }
  }

  /**
   * Migra um domínio específico
   */
  private async migrateSingleDomain(
    domainHealth: DomainHealthStatus, 
    dryRun: boolean
  ): Promise<DomainMigrationResult> {
    const domainStartTime = Date.now();
    
    try {
      logger.info(`🔧 Processing domain migration: ${domainHealth.domainName}`, {
        domainId: domainHealth.domainId,
        status: domainHealth.status,
        issuesCount: domainHealth.issues.length,
        dryRun
      });

      // Determinar ação necessária
      const criticalIssues = domainHealth.issues.filter(i => i.severity === 'CRITICAL');
      const hasMissingDkim = domainHealth.issues.some(i => i.type === 'MISSING_DKIM');
      const hasInvalidKeys = domainHealth.issues.some(i => i.type === 'INVALID_KEYS' || i.type === 'CORRUPTED_DATA');

      let action: DomainMigrationResult['action'];
      let details: string;

      if (domainHealth.status === 'HEALTHY') {
        return {
          domainId: domainHealth.domainId,
          domainName: domainHealth.domainName,
          userId: domainHealth.userId,
          status: 'SKIPPED',
          action: 'ALREADY_HEALTHY',
          details: 'Domain already has healthy DKIM configuration',
          durationMs: Date.now() - domainStartTime
        };
      }

      if (hasMissingDkim) {
        action = 'GENERATED_NEW';
        details = `Generating new DKIM keys for domain missing DKIM configuration`;
      } else if (hasInvalidKeys) {
        action = 'FIXED_CORRUPTED';
        details = `Fixing corrupted DKIM keys`;
      } else {
        action = 'GENERATED_NEW';
        details = `Regenerating DKIM keys due to other issues: ${domainHealth.issues.map(i => i.type).join(', ')}`;
      }

      if (dryRun) {
        return {
          domainId: domainHealth.domainId,
          domainName: domainHealth.domainName,
          userId: domainHealth.userId,
          status: 'SUCCESS',
          action,
          details: `[DRY RUN] Would ${action.toLowerCase()}: ${details}`,
          durationMs: Date.now() - domainStartTime
        };
      }

      // EXECUÇÃO REAL: Gerar/regenerar DKIM usando transação atômica
      await db.transaction(async (trx) => {
        try {
          // Remover DKIM existente (se houver)
          await trx('dkim_keys').where('domain_id', domainHealth.domainId).del();
          
          logger.debug('Removed existing DKIM keys', {
            domainId: domainHealth.domainId,
            domainName: domainHealth.domainName
          });

          // Gerar novas chaves usando o DomainSetupService
          const newDkimKeys = await this.domainSetupService['generateDKIMKeysForDomainTransaction'](
            trx, 
            domainHealth.domainId, 
            domainHealth.domainName
          );

          // Validação final
          if (!newDkimKeys.privateKey || !newDkimKeys.publicKey) {
            throw new Error('Failed to generate valid DKIM keys in transaction');
          }

          logger.info('✅ DKIM keys generated successfully in migration', {
            domainId: domainHealth.domainId,
            domainName: domainHealth.domainName,
            privateKeyLength: newDkimKeys.privateKey.length,
            publicKeyLength: newDkimKeys.publicKey.length
          });

        } catch (transactionError) {
          logger.error('❌ Migration transaction failed', {
            domainId: domainHealth.domainId,
            domainName: domainHealth.domainName,
            error: transactionError instanceof Error ? transactionError.message : String(transactionError)
          });
          throw transactionError;
        }
      });

      return {
        domainId: domainHealth.domainId,
        domainName: domainHealth.domainName,
        userId: domainHealth.userId,
        status: 'SUCCESS',
        action,
        details: `Successfully ${action.toLowerCase()}: ${details}`,
        durationMs: Date.now() - domainStartTime
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error('❌ Domain migration failed', {
        domainId: domainHealth.domainId,
        domainName: domainHealth.domainName,
        error: errorMessage,
        durationMs: Date.now() - domainStartTime
      });

      return {
        domainId: domainHealth.domainId,
        domainName: domainHealth.domainName,
        userId: domainHealth.userId,
        status: 'FAILED',
        action: 'ERROR',
        details: `Migration failed: ${errorMessage}`,
        durationMs: Date.now() - domainStartTime,
        error: errorMessage
      };
    }
  }

  /**
   * Migra um domínio específico pelo nome
   */
  async migrateDomain(domainName: string, dryRun: boolean = false): Promise<DomainMigrationResult | null> {
    logger.info(`🎯 Starting migration for specific domain: ${domainName}`, { dryRun });

    try {
      // Buscar saúde do domínio
      const domainHealth = await dkimHealthChecker.checkDomainHealth(domainName);
      
      if (!domainHealth) {
        logger.warn(`Domain not found: ${domainName}`);
        return null;
      }

      return await this.migrateSingleDomain(domainHealth, dryRun);

    } catch (error) {
      logger.error('Failed to migrate specific domain', {
        domainName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Exporta relatório de migração em JSON
   */
  async exportMigrationReport(result: MigrationResult): Promise<string> {
    const exportData = {
      migration: {
        timestamp: result.startTime,
        duration: `${result.duration}ms`,
        success: result.success,
        summary: {
          totalDomains: result.totalDomains,
          processed: result.processed,
          successful: result.successful,
          failed: result.failed,
          skipped: result.skipped
        }
      },
      statistics: result.summary,
      failedDomains: result.details
        .filter(d => d.status === 'FAILED')
        .map(d => ({
          domainName: d.domainName,
          error: d.error,
          duration: d.durationMs
        })),
      successfulDomains: result.details
        .filter(d => d.status === 'SUCCESS')
        .map(d => ({
          domainName: d.domainName,
          action: d.action,
          duration: d.durationMs
        }))
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Export singleton instance
export const dkimMigrationService = new DKIMMigrationService();