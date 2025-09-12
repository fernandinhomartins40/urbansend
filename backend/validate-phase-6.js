#!/usr/bin/env node

/**
 * 🔍 SCRIPT DE VALIDAÇÃO - FASE 6 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Valida implementação completa da Fase 6: Migration & Cleanup
 * Verifica todos os componentes implementados
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios').default;

const FASE_6_COMPONENTS = {
  // Feature Flags System
  featureFlags: {
    name: '🚩 Sistema de Feature Flags',
    files: [
      'backend/src/config/features.ts',
      'frontend/src/config/features.ts',
      'backend/src/routes/feature-flags.ts'
    ],
    apis: [
      '/api/feature-flags',
      '/api/feature-flags/status',
      '/api/feature-flags/rollout/increase'
    ],
    required: true
  },

  // Migration Monitoring System  
  monitoring: {
    name: '🔍 Sistema de Monitoramento da Migração',
    files: [
      'backend/src/services/MigrationMonitoringService.ts',
      'backend/src/routes/migration-monitoring.ts'
    ],
    apis: [
      '/api/migration-monitoring/metrics',
      '/api/migration-monitoring/health',
      '/api/migration-monitoring/dashboard'
    ],
    required: true
  },

  // Auto Rollback System
  autoRollback: {
    name: '🔄 Sistema de Auto Rollback',
    files: [
      'backend/src/services/AutoRollbackService.ts', 
      'backend/src/routes/auto-rollback.ts'
    ],
    apis: [
      '/api/auto-rollback/status',
      '/api/auto-rollback/history',
      '/api/auto-rollback/triggers'
    ],
    required: true
  },

  // Legacy Cleanup System
  legacyCleanup: {
    name: '🧹 Sistema de Limpeza de Código Legado',
    files: [
      'backend/src/services/LegacyCleanupService.ts'
    ],
    apis: [],
    required: true
  },

  // Frontend Integration
  frontendIntegration: {
    name: '⚛️ Integração Frontend',
    files: [
      'frontend/src/config/features.ts'
    ],
    apis: [],
    required: true
  }
};

// Cores para output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m', 
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const logResult = (success, message) => {
  const icon = success ? '✅' : '❌';
  const color = success ? 'green' : 'red';
  log(`${icon} ${message}`, color);
};

/**
 * Verificar se arquivo existe
 */
function checkFileExists(filePath) {
  const fullPath = path.resolve(filePath);
  return fs.existsSync(fullPath);
}

/**
 * Verificar implementação de um componente
 */
async function validateComponent(componentKey, component) {
  log(`\n${colors.bold}=== VALIDANDO ${component.name} ===${colors.reset}`);
  
  let success = true;
  let details = [];

  // Verificar arquivos
  for (const file of component.files) {
    const exists = checkFileExists(file);
    logResult(exists, `Arquivo: ${file}`);
    
    if (!exists && component.required) {
      success = false;
      details.push(`Arquivo obrigatório ausente: ${file}`);
    }

    // Verificar conteúdo básico dos arquivos críticos
    if (exists) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Verificações específicas por componente
        if (componentKey === 'featureFlags' && file.includes('features.ts')) {
          const hasRolloutFunctions = content.includes('shouldUseIntegratedEmailSend');
          logResult(hasRolloutFunctions, `  Função de rollout implementada em ${file}`);
          
          const hasFeatureInterface = content.includes('FeatureFlagConfig');
          logResult(hasFeatureInterface, `  Interface de feature flags em ${file}`);
        }
        
        if (componentKey === 'monitoring' && file.includes('MigrationMonitoringService.ts')) {
          const hasMetricsCollection = content.includes('collectMetrics');
          logResult(hasMetricsCollection, `  Coleta de métricas implementada em ${file}`);
          
          const hasHealthCheck = content.includes('performHealthCheck');
          logResult(hasHealthCheck, `  Health check implementado em ${file}`);
        }
        
        if (componentKey === 'autoRollback' && file.includes('AutoRollbackService.ts')) {
          const hasTriggers = content.includes('rollbackTriggers');
          logResult(hasTriggers, `  Triggers de rollback implementados em ${file}`);
          
          const hasExecution = content.includes('executeRollback');
          logResult(hasExecution, `  Execução de rollback implementada em ${file}`);
        }

        if (componentKey === 'legacyCleanup' && file.includes('LegacyCleanupService.ts')) {
          const hasCleanupTasks = content.includes('cleanupTasks');
          logResult(hasCleanupTasks, `  Tarefas de cleanup definidas em ${file}`);
          
          const hasExecution = content.includes('executeCleanupPlan');
          logResult(hasExecution, `  Execução de cleanup implementada em ${file}`);
        }
        
      } catch (error) {
        logResult(false, `  Erro ao ler ${file}: ${error.message}`);
        success = false;
      }
    }
  }

  // APIs serão verificadas se servidor estiver rodando (opcional)
  if (component.apis.length > 0) {
    log(`\n📡 APIs para ${component.name}:`);
    for (const api of component.apis) {
      log(`  - ${api}`, 'blue');
    }
  }

  return { success, details, component: componentKey };
}

/**
 * Verificar integração no sistema principal
 */
function validateSystemIntegration() {
  log(`\n${colors.bold}=== VALIDANDO INTEGRAÇÃO NO SISTEMA PRINCIPAL ===${colors.reset}`);
  
  let success = true;
  
  // Verificar se rotas foram registradas no index.ts
  const indexPath = 'backend/src/index.ts';
  if (checkFileExists(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    const integrations = [
      { name: 'Feature Flags Routes', check: 'feature-flags' },
      { name: 'Migration Monitoring Routes', check: 'migration-monitoring' },
      { name: 'Auto Rollback Routes', check: 'auto-rollback' }
    ];
    
    for (const integration of integrations) {
      const isIntegrated = indexContent.includes(integration.check);
      logResult(isIntegrated, `${integration.name} registradas`);
      
      if (!isIntegrated) success = false;
    }
    
    // Verificar se Auto Rollback Service é inicializado
    const hasAutoRollbackInit = indexContent.includes('Auto Rollback Service') && 
                                indexContent.includes('autoRollbackService');
    logResult(hasAutoRollbackInit, 'Auto Rollback Service inicializado no startup');
    
    if (!hasAutoRollbackInit) success = false;
    
  } else {
    logResult(false, 'Arquivo index.ts não encontrado');
    success = false;
  }

  return success;
}

/**
 * Verificar package.json para dependências necessárias
 */
function validateDependencies() {
  log(`\n${colors.bold}=== VALIDANDO DEPENDÊNCIAS ===${colors.reset}`);
  
  let success = true;
  
  const packagePath = 'backend/package.json';
  if (checkFileExists(packagePath)) {
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencies = { ...packageContent.dependencies, ...packageContent.devDependencies };
    
    const requiredDeps = [
      { name: 'node-cron', purpose: 'Agendamento de tarefas de rollback' },
      { name: 'axios', purpose: 'Requisições HTTP para APIs' }
    ];
    
    for (const dep of requiredDeps) {
      const hasDependent = dependencies[dep.name];
      logResult(hasDependent, `${dep.name} - ${dep.purpose}`);
      
      if (!hasDependent) success = false;
    }
    
  } else {
    logResult(false, 'package.json não encontrado');
    success = false;
  }

  return success;
}

/**
 * Verificar estrutura de diretórios
 */
function validateDirectoryStructure() {
  log(`\n${colors.bold}=== VALIDANDO ESTRUTURA DE DIRETÓRIOS ===${colors.reset}`);
  
  let success = true;
  
  const expectedDirs = [
    'backend/src/config',
    'backend/src/routes', 
    'backend/src/services',
    'frontend/src/config'
  ];
  
  for (const dir of expectedDirs) {
    const exists = fs.existsSync(dir);
    logResult(exists, `Diretório: ${dir}`);
    
    if (!exists) success = false;
  }

  return success;
}

/**
 * Validação principal
 */
async function main() {
  log(`${colors.bold}🚀 INICIANDO VALIDAÇÃO DA FASE 6 - MIGRATION & CLEANUP${colors.reset}`);
  log(`${colors.bold}===============================================================${colors.reset}\n`);
  
  let overallSuccess = true;
  const results = [];

  // Validar estrutura de diretórios
  const dirSuccess = validateDirectoryStructure();
  if (!dirSuccess) overallSuccess = false;

  // Validar dependências
  const depSuccess = validateDependencies();  
  if (!depSuccess) overallSuccess = false;

  // Validar cada componente
  for (const [key, component] of Object.entries(FASE_6_COMPONENTS)) {
    try {
      const result = await validateComponent(key, component);
      results.push(result);
      
      if (!result.success && component.required) {
        overallSuccess = false;
      }
    } catch (error) {
      log(`❌ Erro ao validar ${component.name}: ${error.message}`, 'red');
      overallSuccess = false;
      results.push({ success: false, details: [error.message], component: key });
    }
  }

  // Validar integração no sistema
  const integrationSuccess = validateSystemIntegration();
  if (!integrationSuccess) overallSuccess = false;

  // Relatório final
  log(`\n${colors.bold}===============================================================${colors.reset}`);
  log(`${colors.bold}📊 RELATÓRIO FINAL DA VALIDAÇÃO${colors.reset}\n`);

  const successfulComponents = results.filter(r => r.success).length;
  const totalComponents = Object.keys(FASE_6_COMPONENTS).length;

  log(`Componentes validados: ${successfulComponents}/${totalComponents}`);
  log(`Integração no sistema: ${integrationSuccess ? 'OK' : 'FALHA'}`);
  log(`Estrutura de diretórios: ${dirSuccess ? 'OK' : 'FALHA'}`);
  log(`Dependências: ${depSuccess ? 'OK' : 'FALHA'}`);

  if (overallSuccess) {
    log(`\n🎉 FASE 6 IMPLEMENTADA COM SUCESSO!`, 'green');
    log(`✅ Todos os componentes estão implementados e integrados`, 'green');
    log(`🚀 Sistema pronto para rollout gradual controlado`, 'green');
    
    log(`\n${colors.bold}🎯 PRÓXIMOS PASSOS:${colors.reset}`);
    log(`1. Configurar variáveis de ambiente para feature flags`, 'blue');
    log(`2. Testar APIs de monitoramento e controle`, 'blue');
    log(`3. Iniciar rollout com 10% dos usuários`, 'blue');
    log(`4. Monitorar métricas e ajustar conforme necessário`, 'blue');
    
  } else {
    log(`\n❌ FASE 6 INCOMPLETA`, 'red');
    log(`⚠️ Alguns componentes precisam de atenção`, 'yellow');
    
    // Mostrar problemas encontrados
    const failedResults = results.filter(r => !r.success);
    if (failedResults.length > 0) {
      log(`\n${colors.bold}🔧 PROBLEMAS ENCONTRADOS:${colors.reset}`);
      for (const result of failedResults) {
        log(`\n❌ ${FASE_6_COMPONENTS[result.component].name}:`, 'red');
        for (const detail of result.details) {
          log(`  - ${detail}`, 'yellow');
        }
      }
    }
  }

  log(`\n${colors.bold}===============================================================${colors.reset}`);
  
  // Exit code para CI/CD
  process.exit(overallSuccess ? 0 : 1);
}

// Executar validação
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Erro na validação:', error);
    process.exit(1);
  });
}

module.exports = { main, FASE_6_COMPONENTS };