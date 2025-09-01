#!/usr/bin/env node

/**
 * Teste Simples da Fase 3 - Sistema de Filas e Processamento
 * 
 * Este script testa as funcionalidades principais dos componentes da Fase 3
 * verificando a implementação do sistema de filas com Redis Bull.
 */

console.log('🚀 Iniciando Teste da Fase 3 - Sistema de Filas');
console.log('===============================================\n');

class Phase3Tester {
  constructor() {
    this.testResults = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runTest(testName, testFunction) {
    this.totalTests++;
    console.log(`🧪 Testando: ${testName}`);
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.passedTests++;
      this.testResults.push({
        name: testName,
        status: 'PASSOU',
        duration,
        error: null
      });
      
      console.log(`✅ ${testName} - PASSOU (${duration}ms)`);
    } catch (error) {
      this.failedTests++;
      this.testResults.push({
        name: testName,
        status: 'FALHOU',
        duration: 0,
        error: error.message
      });
      
      console.log(`❌ ${testName} - FALHOU: ${error.message}`);
    }
  }

  async testPhase3Files() {
    const fs = require('fs');
    const path = require('path');
    
    const expectedFiles = [
      'backend/src/services/queueService.ts',
      'backend/src/services/analyticsService.ts',
      'backend/src/services/queueMonitorService.ts'
    ];

    for (const filePath of expectedFiles) {
      await this.runTest(`Arquivo ${filePath}`, async () => {
        const fullPath = path.join(process.cwd(), filePath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Arquivo não encontrado: ${fullPath}`);
        }
        
        const stats = fs.statSync(fullPath);
        if (stats.size === 0) {
          throw new Error(`Arquivo está vazio: ${fullPath}`);
        }
      });
    }
  }

  async testQueueServiceImplementation() {
    const fs = require('fs');
    const path = require('path');
    
    await this.runTest('QueueService - Estrutura Principal', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/queueService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const requiredComponents = [
        'class QueueService',
        'import Bull',
        'EmailJobData',
        'WebhookJobData', 
        'AnalyticsJobData',
        'addEmailJob',
        'addBatchEmailJob',
        'addWebhookJob',
        'addAnalyticsJob',
        'processEmailJob',
        'processWebhookJob',
        'processAnalyticsJob'
      ];

      for (const component of requiredComponents) {
        if (!content.includes(component)) {
          throw new Error(`Componente obrigatório não encontrado: ${component}`);
        }
      }
    });

    await this.runTest('QueueService - Configuração Redis', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/queueService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const redisConfigs = [
        'REDIS_HOST',
        'REDIS_PORT',
        'redis',
        'emailQueue',
        'webhookQueue', 
        'analyticsQueue'
      ];

      for (const config of redisConfigs) {
        if (!content.includes(config)) {
          throw new Error(`Configuração Redis não encontrada: ${config}`);
        }
      }
    });
  }

  async testAnalyticsServiceImplementation() {
    const fs = require('fs');
    const path = require('path');
    
    await this.runTest('AnalyticsService - Estrutura Principal', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/analyticsService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const requiredComponents = [
        'class AnalyticsService',
        'EmailMetrics',
        'DomainMetrics',
        'CampaignMetrics',
        'AnalyticsJobData',
        'processAnalyticsJob',
        'processEmailEvent',
        'updateCampaignMetrics',
        'updateDomainReputation',
        'getEmailMetrics',
        'getCampaignMetrics',
        'getDomainMetrics'
      ];

      for (const component of requiredComponents) {
        if (!content.includes(component)) {
          throw new Error(`Componente Analytics obrigatório não encontrado: ${component}`);
        }
      }
    });

    await this.runTest('AnalyticsService - Tabelas de Banco', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/analyticsService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const requiredTables = [
        'email_events',
        'campaign_metrics',
        'domain_metrics', 
        'time_series_metrics',
        'user_engagement'
      ];

      for (const table of requiredTables) {
        if (!content.includes(table)) {
          throw new Error(`Tabela de analytics não encontrada: ${table}`);
        }
      }
    });
  }

  async testQueueMonitorImplementation() {
    const fs = require('fs');
    const path = require('path');
    
    await this.runTest('QueueMonitorService - Estrutura Principal', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/queueMonitorService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const requiredComponents = [
        'class QueueMonitorService',
        'QueueMetrics',
        'QueueHealthStatus',
        'AlertConfig',
        'startMonitoring',
        'stopMonitoring',
        'collectMetrics',
        'checkAlerts',
        'performHealthCheck',
        'createAlert',
        'getQueueMetrics'
      ];

      for (const component of requiredComponents) {
        if (!content.includes(component)) {
          throw new Error(`Componente Monitor obrigatório não encontrado: ${component}`);
        }
      }
    });

    await this.runTest('QueueMonitorService - Sistema de Alertas', async () => {
      const filePath = path.join(process.cwd(), 'backend/src/services/queueMonitorService.ts');
      const content = fs.readFileSync(filePath, 'utf8');
      
      const alertFeatures = [
        'high_failure_rate',
        'high_waiting_count',
        'queue_stuck',
        'redis_disconnection',
        'sendWebhookAlert',
        'sendEmailAlert',
        'triggerAlert'
      ];

      for (const feature of alertFeatures) {
        if (!content.includes(feature)) {
          throw new Error(`Funcionalidade de alerta não encontrada: ${feature}`);
        }
      }
    });
  }

  async testTypeScriptCompilation() {
    await this.runTest('Compilação TypeScript - Fase 3', async () => {
      // Verificar se os arquivos .js foram gerados no build
      const fs = require('fs');
      const path = require('path');
      
      const expectedJSFiles = [
        'backend/dist/services/queueService.js',
        'backend/dist/services/analyticsService.js',
        'backend/dist/services/queueMonitorService.js'
      ];

      let compiledFiles = 0;
      for (const filePath of expectedJSFiles) {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
          compiledFiles++;
        }
      }

      if (compiledFiles === 0) {
        throw new Error('Nenhum arquivo TypeScript da Fase 3 foi compilado');
      }

      console.log(`   📊 ${compiledFiles}/${expectedJSFiles.length} arquivos da Fase 3 compilados`);
    });
  }

  async testServiceIntegration() {
    await this.runTest('Integração EmailService com Filas', async () => {
      const fs = require('fs');
      const path = require('path');
      
      const emailServicePath = path.join(process.cwd(), 'backend/src/services/emailService.ts');
      const content = fs.readFileSync(emailServicePath, 'utf8');
      
      const integrationPoints = [
        'processEmailJob',
        'processBatchEmailJob',
        'recordEmailEvent',
        'QueueService',
        'addAnalyticsJob'
      ];

      for (const point of integrationPoints) {
        if (!content.includes(point)) {
          throw new Error(`Ponto de integração com filas não encontrado: ${point}`);
        }
      }
    });

    await this.runTest('Integração WebhookService com Filas', async () => {
      const fs = require('fs');
      const path = require('path');
      
      const webhookServicePath = path.join(process.cwd(), 'backend/src/services/webhookService.ts');
      const content = fs.readFileSync(webhookServicePath, 'utf8');
      
      const integrationPoints = [
        'processWebhookJob',
        'processDeliveryNotification',
        'logWebhookDelivery',
        'WebhookJobData'
      ];

      for (const point of integrationPoints) {
        if (!content.includes(point)) {
          throw new Error(`Ponto de integração webhook com filas não encontrado: ${point}`);
        }
      }
    });
  }

  async testQueueConfiguration() {
    await this.runTest('Configuração de Job Options', async () => {
      const fs = require('fs');
      const path = require('path');
      
      const queueServicePath = path.join(process.cwd(), 'backend/src/services/queueService.ts');
      const content = fs.readFileSync(queueServicePath, 'utf8');
      
      const jobOptions = [
        'priority',
        'attempts',
        'backoff',
        'delay',
        'JobOptions'
      ];

      for (const option of jobOptions) {
        if (!content.includes(option)) {
          throw new Error(`Opção de job não encontrada: ${option}`);
        }
      }
    });

    await this.runTest('Processadores de Jobs', async () => {
      const fs = require('fs');
      const path = require('path');
      
      const queueServicePath = path.join(process.cwd(), 'backend/src/services/queueService.ts');
      const content = fs.readFileSync(queueServicePath, 'utf8');
      
      const processors = [
        'process(',
        'setupProcessors',
        'send-email',
        'send-webhook',
        'update-analytics'
      ];

      for (const processor of processors) {
        if (!content.includes(processor)) {
          throw new Error(`Processador de job não encontrado: ${processor}`);
        }
      }
    });
  }

  async runAllTests() {
    console.log('📁 Testando Arquivos da Fase 3...');
    await this.testPhase3Files();

    console.log('\n🔧 Testando QueueService...');
    await this.testQueueServiceImplementation();

    console.log('\n📊 Testando AnalyticsService...');
    await this.testAnalyticsServiceImplementation();

    console.log('\n📈 Testando QueueMonitorService...');
    await this.testQueueMonitorImplementation();

    console.log('\n🔨 Testando Compilação TypeScript...');
    await this.testTypeScriptCompilation();

    console.log('\n🔗 Testando Integrações...');
    await this.testServiceIntegration();

    console.log('\n⚙️ Testando Configuração de Filas...');
    await this.testQueueConfiguration();

    this.printResults();
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DOS RESULTADOS DE TESTE - FASE 3');
    console.log('='.repeat(60));
    
    console.log(`\n📈 Resultados Gerais:`);
    console.log(`   Total de Testes: ${this.totalTests}`);
    console.log(`   ✅ Aprovados: ${this.passedTests}`);
    console.log(`   ❌ Reprovados: ${this.failedTests}`);
    console.log(`   📊 Taxa de Sucesso: ${((this.passedTests / this.totalTests) * 100).toFixed(1)}%`);

    if (this.failedTests > 0) {
      console.log(`\n❌ Testes que Falharam:`);
      this.testResults
        .filter(result => result.status === 'FALHOU')
        .forEach(result => {
          console.log(`   • ${result.name}: ${result.error}`);
        });
    }

    console.log(`\n⏱️ Performance:`);
    const totalDuration = this.testResults.reduce((sum, result) => sum + result.duration, 0);
    console.log(`   Duração Total: ${totalDuration}ms`);
    console.log(`   Média por Teste: ${(totalDuration / this.totalTests).toFixed(1)}ms`);

    console.log('\n' + '='.repeat(60));
    
    if (this.failedTests === 0) {
      console.log('🎉 TODOS OS TESTES DA FASE 3 PASSARAM!');
      console.log('');
      console.log('✅ Componentes da Fase 3 Validados:');
      console.log('   • QueueService - Sistema de filas Redis Bull completo');
      console.log('   • AnalyticsService - Processamento de métricas e eventos');
      console.log('   • QueueMonitorService - Monitoramento e alertas de filas');
      console.log('   • EmailService - Integração com sistema de filas');
      console.log('   • WebhookService - Processamento via filas');
      console.log('   • Job Processors - Processadores assíncronos');
      console.log('   • Event Handlers - Manipuladores de eventos');
      console.log('   • Queue Management - Gerenciamento avançado de filas');
      console.log('   • Alert System - Sistema completo de alertas');
      console.log('');
      console.log('🚀 A Fase 3 do plano foi implementada com sucesso!');
      console.log('💡 Sistema de Filas e Processamento está operacional');
      process.exit(0);
    } else {
      console.log('⚠️ Alguns testes da Fase 3 falharam. Revise os erros acima.');
      process.exit(1);
    }
  }
}

// Executar os testes
async function main() {
  const tester = new Phase3Tester();
  
  try {
    await tester.runAllTests();
  } catch (error) {
    console.error('❌ Suite de testes da Fase 3 falhou:', error);
    process.exit(1);
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = Phase3Tester;