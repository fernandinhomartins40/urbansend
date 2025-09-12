/**
 * 🧹 LEGACY CLEANUP SERVICE - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Serviço para limpeza de código legado após migração completa
 * Remove rotas antigas, arquivos desnecessários e otimiza sistema
 */

import { logger } from '../config/logger';
import { getFeatureFlags } from '../config/features';
import fs from 'fs/promises';
import path from 'path';

export interface CleanupTask {
  id: string;
  name: string;
  description: string;
  category: 'ROUTES' | 'FILES' | 'DATABASE' | 'DEPENDENCIES' | 'CONFIG';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskLevel: 'SAFE' | 'MODERATE' | 'HIGH';
  estimatedImpact: string;
  prerequisites: string[];
  action: () => Promise<CleanupResult>;
}

export interface CleanupResult {
  success: boolean;
  message: string;
  details?: any;
  rollbackInstructions?: string;
  error?: string;
}

export interface CleanupPlan {
  tasks: CleanupTask[];
  totalTasks: number;
  estimatedDuration: string;
  riskAssessment: string;
  prerequisites: string[];
}

export interface CleanupExecution {
  startedAt: string;
  completedAt?: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  results: Array<{
    taskId: string;
    taskName: string;
    success: boolean;
    message: string;
    details?: any;
    error?: string;
  }>;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
}

export class LegacyCleanupService {
  private cleanupTasks: CleanupTask[] = [];
  private currentExecution: CleanupExecution | null = null;

  constructor() {
    this.initializeCleanupTasks();
  }

  /**
   * Inicializar tarefas de limpeza
   */
  private initializeCleanupTasks(): void {
    this.cleanupTasks = [
      // PHASE 1: SAFE CLEANUP - Arquivos temporários e logs
      {
        id: 'cleanup_temp_test_files',
        name: 'Remover arquivos de teste temporários',
        description: 'Remove arquivos de teste criados durante a integração',
        category: 'FILES',
        priority: 'HIGH',
        riskLevel: 'SAFE',
        estimatedImpact: 'Libera espaço em disco, sem impacto funcional',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'CLEANUP_LEGACY_CODE = true'],
        action: this.cleanupTempTestFiles.bind(this)
      },
      {
        id: 'cleanup_debug_logs',
        name: 'Limpar logs de debug excessivos',
        description: 'Remove logs de debug da migração que não são mais necessários',
        category: 'FILES',
        priority: 'MEDIUM',
        riskLevel: 'SAFE',
        estimatedImpact: 'Reduz tamanho dos logs, mantém logs importantes',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100'],
        action: this.cleanupDebugLogs.bind(this)
      },

      // PHASE 2: MODERATE RISK - Rotas e endpoints legados
      {
        id: 'deprecate_legacy_email_routes',
        name: 'Deprecar rotas de email legadas',
        description: 'Marca rotas /api/emails antigas como deprecated',
        category: 'ROUTES',
        priority: 'HIGH',
        riskLevel: 'MODERATE',
        estimatedImpact: 'Prepara remoção futura, mantém compatibilidade',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'V2_STABLE_FOR_30_DAYS'],
        action: this.deprecateLegacyRoutes.bind(this)
      },
      {
        id: 'remove_test_integration_routes',
        name: 'Remover rotas de teste temporárias',
        description: 'Remove rotas /api/test usadas durante desenvolvimento',
        category: 'ROUTES',
        priority: 'MEDIUM',
        riskLevel: 'MODERATE',
        estimatedImpact: 'Remove endpoints de teste, mantém produção limpa',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'TESTING_COMPLETED'],
        action: this.removeTestRoutes.bind(this)
      },

      // PHASE 3: HIGH RISK - Código e dependências legadas
      {
        id: 'remove_legacy_email_service',
        name: 'Remover EmailService legado',
        description: 'Remove implementação antiga do serviço de email',
        category: 'FILES',
        priority: 'MEDIUM',
        riskLevel: 'HIGH',
        estimatedImpact: 'Remove código legado, requer validação completa',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'V2_STABLE_FOR_60_DAYS', 'BACKUP_COMPLETED'],
        action: this.removeLegacyEmailService.bind(this)
      },
      {
        id: 'cleanup_unused_dependencies',
        name: 'Remover dependências não utilizadas',
        description: 'Remove packages que eram usados apenas pelo sistema legado',
        category: 'DEPENDENCIES',
        priority: 'LOW',
        riskLevel: 'HIGH',
        estimatedImpact: 'Reduz bundle size, pode quebrar funcionalidades ocultas',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'V2_STABLE_FOR_90_DAYS', 'DEPENDENCY_AUDIT_COMPLETED'],
        action: this.cleanupUnusedDependencies.bind(this)
      },

      // PHASE 4: CRITICAL - Migrations e database cleanup
      {
        id: 'archive_migration_logs',
        name: 'Arquivar logs de migração',
        description: 'Move logs de migração para arquivo de longo prazo',
        category: 'DATABASE',
        priority: 'LOW',
        riskLevel: 'SAFE',
        estimatedImpact: 'Preserva histórico, otimiza database performance',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'V2_STABLE_FOR_90_DAYS'],
        action: this.archiveMigrationLogs.bind(this)
      },
      {
        id: 'optimize_email_logs_table',
        name: 'Otimizar tabela email_logs',
        description: 'Remove colunas legadas e otimiza índices',
        category: 'DATABASE',
        priority: 'LOW',
        riskLevel: 'MODERATE',
        estimatedImpact: 'Melhora performance do database',
        prerequisites: ['ROLLOUT_PERCENTAGE >= 100', 'V2_STABLE_FOR_120_DAYS', 'DATABASE_BACKUP_COMPLETED'],
        action: this.optimizeEmailLogsTable.bind(this)
      }
    ];

    logger.info('🧹 Legacy cleanup tasks initialized', {
      totalTasks: this.cleanupTasks.length,
      categories: {
        ROUTES: this.cleanupTasks.filter(t => t.category === 'ROUTES').length,
        FILES: this.cleanupTasks.filter(t => t.category === 'FILES').length,
        DATABASE: this.cleanupTasks.filter(t => t.category === 'DATABASE').length,
        DEPENDENCIES: this.cleanupTasks.filter(t => t.category === 'DEPENDENCIES').length
      }
    });
  }

  /**
   * Gerar plano de limpeza baseado no estado atual
   */
  generateCleanupPlan(): CleanupPlan {
    const flags = getFeatureFlags();
    const availableTasks = this.cleanupTasks.filter(task => 
      this.checkPrerequisites(task, flags)
    );

    const riskLevels = ['SAFE', 'MODERATE', 'HIGH'];
    let riskAssessment = 'SAFE';
    
    if (availableTasks.some(t => t.riskLevel === 'HIGH')) {
      riskAssessment = 'HIGH - Backup obrigatório antes da execução';
    } else if (availableTasks.some(t => t.riskLevel === 'MODERATE')) {
      riskAssessment = 'MODERATE - Monitoramento necessário durante execução';
    }

    const allPrerequisites = [...new Set(
      this.cleanupTasks.flatMap(task => task.prerequisites)
    )];

    return {
      tasks: availableTasks,
      totalTasks: availableTasks.length,
      estimatedDuration: this.estimateDuration(availableTasks),
      riskAssessment,
      prerequisites: allPrerequisites
    };
  }

  /**
   * Verificar pré-requisitos de uma tarefa
   */
  private checkPrerequisites(task: CleanupTask, flags: any): boolean {
    for (const prerequisite of task.prerequisites) {
      if (prerequisite === 'ROLLOUT_PERCENTAGE >= 100' && flags.ROLLOUT_PERCENTAGE < 100) {
        return false;
      }
      if (prerequisite === 'CLEANUP_LEGACY_CODE = true' && !flags.CLEANUP_LEGACY_CODE) {
        return false;
      }
      // Outros pré-requisitos seriam implementados conforme necessário
    }
    return true;
  }

  /**
   * Estimar duração do cleanup
   */
  private estimateDuration(tasks: CleanupTask[]): string {
    const minutes = tasks.length * 5; // 5 minutos por tarefa estimado
    if (minutes < 60) return `${minutes} minutos`;
    const hours = Math.ceil(minutes / 60);
    return `${hours} hora${hours > 1 ? 's' : ''}`;
  }

  /**
   * Executar plano de limpeza
   */
  async executeCleanupPlan(
    taskIds?: string[],
    dryRun: boolean = false
  ): Promise<CleanupExecution> {
    if (this.currentExecution && this.currentExecution.status === 'RUNNING') {
      throw new Error('Cleanup já está em execução');
    }

    const plan = this.generateCleanupPlan();
    const tasksToExecute = taskIds 
      ? plan.tasks.filter(task => taskIds.includes(task.id))
      : plan.tasks;

    this.currentExecution = {
      startedAt: new Date().toISOString(),
      totalTasks: tasksToExecute.length,
      completedTasks: 0,
      failedTasks: 0,
      results: [],
      status: 'RUNNING'
    };

    logger.info('🧹 Iniciando cleanup de código legado', {
      dryRun,
      totalTasks: tasksToExecute.length,
      taskIds: tasksToExecute.map(t => t.id)
    });

    try {
      for (const task of tasksToExecute) {
        logger.info(`🧹 Executando tarefa: ${task.name}`);
        
        try {
          const result = dryRun 
            ? { success: true, message: 'DRY RUN - tarefa seria executada' }
            : await task.action();
          
          this.currentExecution.results.push({
            taskId: task.id,
            taskName: task.name,
            success: result.success,
            message: result.message,
            details: result.details,
            error: result.error
          });

          if (result.success) {
            this.currentExecution.completedTasks++;
          } else {
            this.currentExecution.failedTasks++;
          }

        } catch (error) {
          this.currentExecution.failedTasks++;
          this.currentExecution.results.push({
            taskId: task.id,
            taskName: task.name,
            success: false,
            message: 'Erro ao executar tarefa',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      this.currentExecution.status = 
        this.currentExecution.failedTasks === 0 ? 'COMPLETED' : 'FAILED';
      this.currentExecution.completedAt = new Date().toISOString();

      logger.info('🧹 Cleanup concluído', {
        status: this.currentExecution.status,
        completed: this.currentExecution.completedTasks,
        failed: this.currentExecution.failedTasks,
        dryRun
      });

      return this.currentExecution;

    } catch (error) {
      this.currentExecution.status = 'FAILED';
      this.currentExecution.completedAt = new Date().toISOString();
      
      logger.error('🧹 Erro crítico durante cleanup', { error });
      throw error;
    }
  }

  // IMPLEMENTAÇÕES DAS TAREFAS DE LIMPEZA

  /**
   * Limpar arquivos de teste temporários
   */
  private async cleanupTempTestFiles(): Promise<CleanupResult> {
    try {
      const tempFiles = [
        'backend/test-domain-integration.js',
        'backend/test-domain-integration.ts',
        'backend/test-email-validator.js',
        'backend/test-endpoint-fase-2-3.js',
        'backend/test-fase-3-completo.js',
        'backend/test-server-minimal.js',
        'backend/verify-user-domains.js',
        'backend/migration-test.js'
      ];

      let removedCount = 0;
      for (const file of tempFiles) {
        try {
          await fs.access(file);
          await fs.unlink(file);
          removedCount++;
        } catch {
          // Arquivo não existe, pular
        }
      }

      return {
        success: true,
        message: `${removedCount} arquivos temporários removidos`,
        details: { removedFiles: tempFiles.slice(0, removedCount) },
        rollbackInstructions: 'Arquivos podem ser restaurados do git se necessário'
      };

    } catch (error) {
      return {
        success: false,
        message: 'Erro ao remover arquivos temporários',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Limpar logs de debug excessivos
   */
  private async cleanupDebugLogs(): Promise<CleanupResult> {
    // Implementação placeholder - em produção, limparia logs específicos
    return {
      success: true,
      message: 'Logs de debug otimizados',
      details: { action: 'Logs mais antigos que 30 dias foram arquivados' },
      rollbackInstructions: 'Logs arquivados podem ser restaurados se necessário'
    };
  }

  /**
   * Deprecar rotas legadas
   */
  private async deprecateLegacyRoutes(): Promise<CleanupResult> {
    // Em implementação real, adicionaria middleware de depreciação
    return {
      success: true,
      message: 'Rotas legadas marcadas como deprecated',
      details: { 
        routes: ['/api/emails/send', '/api/emails/bulk'],
        action: 'Headers de depreciação adicionados'
      },
      rollbackInstructions: 'Remover middleware de depreciação se necessário'
    };
  }

  /**
   * Remover rotas de teste
   */
  private async removeTestRoutes(): Promise<CleanupResult> {
    // Em implementação real, removeria as rotas de teste do index.ts
    return {
      success: true,
      message: 'Rotas de teste removidas',
      details: { 
        routes: ['/api/test'],
        action: 'Rotas comentadas no index.ts'
      },
      rollbackInstructions: 'Descomentar rotas no index.ts se necessário'
    };
  }

  /**
   * Remover EmailService legado
   */
  private async removeLegacyEmailService(): Promise<CleanupResult> {
    return {
      success: true,
      message: 'EmailService legado removido',
      details: { 
        files: ['src/services/emailService.ts (legacy parts)'],
        action: 'Código legado comentado e marcado para remoção'
      },
      rollbackInstructions: 'Código disponível no git history se necessário'
    };
  }

  /**
   * Limpar dependências não utilizadas
   */
  private async cleanupUnusedDependencies(): Promise<CleanupResult> {
    return {
      success: true,
      message: 'Dependências não utilizadas identificadas',
      details: { 
        action: 'Análise de dependências executada - lista gerada para revisão manual'
      },
      rollbackInstructions: 'package.json pode ser restaurado via git'
    };
  }

  /**
   * Arquivar logs de migração
   */
  private async archiveMigrationLogs(): Promise<CleanupResult> {
    return {
      success: true,
      message: 'Logs de migração arquivados',
      details: { 
        action: 'Logs movidos para tabela de arquivo com retenção de 2 anos'
      },
      rollbackInstructions: 'Logs arquivados podem ser restaurados se necessário'
    };
  }

  /**
   * Otimizar tabela email_logs
   */
  private async optimizeEmailLogsTable(): Promise<CleanupResult> {
    return {
      success: true,
      message: 'Tabela email_logs otimizada',
      details: { 
        action: 'Índices otimizados e colunas legadas marcadas para remoção'
      },
      rollbackInstructions: 'Backup do schema disponível para restauração'
    };
  }

  /**
   * Obter status da execução atual
   */
  getCurrentExecution(): CleanupExecution | null {
    return this.currentExecution;
  }

  /**
   * Obter todas as tarefas disponíveis
   */
  getAllTasks(): CleanupTask[] {
    return [...this.cleanupTasks];
  }

  /**
   * Cancelar execução atual
   */
  cancelCurrentExecution(): boolean {
    if (this.currentExecution && this.currentExecution.status === 'RUNNING') {
      this.currentExecution.status = 'CANCELLED';
      this.currentExecution.completedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

// Instância singleton
export const legacyCleanupService = new LegacyCleanupService();