/**
 * ⚡ TESTES DE PERFORMANCE - FASE 5 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Requisitos de Performance:
 * - Email Success Rate: > 95%
 * - Domain Validation Rate: > 99%  
 * - API Latency: < 2s p95
 * - Frontend Error Rate: < 1%
 * - Performance adequada (< 2s por envio)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../index';
import db from '../../config/database';
import { SimpleEmailValidator } from '../../email/EmailValidator';
import { logger } from '../../config/logger';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  totalTime: number;
  avgTime: number;
  medianTime: number;
  p95Time: number;
  p99Time: number;
  minTime: number;
  maxTime: number;
  successRate: number;
  errorRate: number;
}

interface TestContext {
  userId: number;
  userToken: string;
  testDomains: string[];
}

let context: TestContext;

beforeAll(async () => {
  // Setup usuário e domínios para testes de performance
  const userData = {
    name: 'Performance Test User',
    email: `perf-test-${Date.now()}@example.com`,
    password: 'hashed_password',
    is_verified: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  const [userId] = await db('users').insert(userData).returning('id');
  
  context = {
    userId,
    userToken: 'mock-jwt-token-performance',
    testDomains: []
  };

  // Criar múltiplos domínios verificados para testes
  const domains = [
    `perf-domain-1-${Date.now()}.com`,
    `perf-domain-2-${Date.now()}.com`,
    `perf-domain-3-${Date.now()}.com`
  ];

  for (const domain of domains) {
    await db('user_domains').insert({
      user_id: userId,
      domain_name: domain,
      is_verified: true,
      verification_status: 'verified',
      verified_at: new Date(),
      dkim_enabled: true,
      spf_enabled: true,
      created_at: new Date(),
      updated_at: new Date()
    });
    context.testDomains.push(domain);
  }

  logger.info('🏁 Performance Tests - Setup concluído', {
    userId,
    domains: context.testDomains.length
  });
});

afterAll(async () => {
  // Limpeza
  if (context.testDomains.length > 0) {
    await db('user_domains').whereIn('domain_name', context.testDomains).del();
  }
  await db('users').where('id', context.userId).del();
  
  logger.info('🏁 Performance Tests - Limpeza concluída');
});

describe('⚡ Performance Tests - Requisitos Críticos', () => {

  /**
   * 🎯 TESTE 1: LATÊNCIA DE API < 2s (Requisito P95)
   */
  describe('1. API Latency - Requisito < 2s p95', () => {
    
    it('should maintain API latency under 2s for 95% of requests', async () => {
      const testDomain = context.testDomains[0];
      const requestCount = 50; // Amostra estatisticamente significativa
      const times: number[] = [];
      let successCount = 0;
      
      logger.info('⚡ Testando latência da API', {
        testDomain,
        requestCount,
        requirement: '< 2s p95'
      });

      for (let i = 0; i < requestCount; i++) {
        const startTime = performance.now();
        
        try {
          const response = await request(app)
            .post('/api/emails-v2/send-v2')
            .set('Authorization', `Bearer ${context.userToken}`)
            .send({
              from: `perf-test-${i}@${testDomain}`,
              to: `recipient-${i}@example.com`,
              subject: `Performance Test ${i}`,
              text: `Performance test email ${i} for latency measurement.`,
              html: `<p>Performance test email <strong>${i}</strong> for latency measurement.</p>`
            });
          
          const endTime = performance.now();
          const requestTime = endTime - startTime;
          times.push(requestTime);
          
          if (response.status === 200) {
            successCount++;
          }
          
          logger.debug(`Request ${i + 1}/${requestCount}`, {
            time: `${requestTime.toFixed(2)}ms`,
            status: response.status
          });
          
        } catch (error) {
          const endTime = performance.now();
          times.push(endTime - startTime);
          logger.error(`Request ${i + 1} failed`, { error: error.message });
        }
        
        // Pequeno delay para evitar sobrecarga
        if (i < requestCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Calcular métricas de performance
      const metrics = calculatePerformanceMetrics(times, successCount, requestCount);
      
      logger.info('📊 Métricas de Latência da API', {
        testDomain,
        samples: requestCount,
        avgTime: `${metrics.avgTime.toFixed(2)}ms`,
        medianTime: `${metrics.medianTime.toFixed(2)}ms`,
        p95Time: `${metrics.p95Time.toFixed(2)}ms`,
        p99Time: `${metrics.p99Time.toFixed(2)}ms`,
        minTime: `${metrics.minTime.toFixed(2)}ms`,
        maxTime: `${metrics.maxTime.toFixed(2)}ms`,
        successRate: `${metrics.successRate.toFixed(1)}%`,
        errorRate: `${metrics.errorRate.toFixed(1)}%`
      });

      // VALIDAÇÕES DE PERFORMANCE (REQUISITOS CRÍTICOS)
      expect(metrics.p95Time).toBeLessThan(2000); // < 2s p95 (REQUISITO)
      expect(metrics.successRate).toBeGreaterThan(95); // > 95% success rate
      expect(metrics.errorRate).toBeLessThan(1); // < 1% error rate
      expect(metrics.avgTime).toBeLessThan(1500); // Média < 1.5s (meta)
      
      logger.info('✅ Requisitos de latência atendidos', {
        p95Requirement: 'PASSOU',
        successRateRequirement: 'PASSOU',
        errorRateRequirement: 'PASSOU'
      });
    });

    it('should handle concurrent requests efficiently', async () => {
      const testDomain = context.testDomains[1];
      const concurrentRequests = 20;
      
      logger.info('⚡ Testando requisições concorrentes', {
        testDomain,
        concurrentRequests
      });

      const startTime = performance.now();
      
      // Fazer todas as requisições em paralelo
      const promises = Array.from({ length: concurrentRequests }, (_, i) => 
        request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${context.userToken}`)
          .send({
            from: `concurrent-${i}@${testDomain}`,
            to: `recipient-${i}@example.com`,
            subject: `Concurrent Test ${i}`,
            text: `Concurrent test email ${i}.`
          })
      );

      const responses = await Promise.allSettled(promises);
      const totalTime = performance.now() - startTime;
      
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      
      const failed = responses.length - successful;
      const successRate = (successful / responses.length) * 100;
      const avgTimePerRequest = totalTime / responses.length;

      logger.info('📊 Métricas de Concorrência', {
        testDomain,
        totalRequests: concurrentRequests,
        successful,
        failed,
        successRate: `${successRate.toFixed(1)}%`,
        totalTime: `${totalTime.toFixed(2)}ms`,
        avgTimePerRequest: `${avgTimePerRequest.toFixed(2)}ms`
      });

      // Validações para concorrência
      expect(successRate).toBeGreaterThan(90); // 90% de sucesso mínimo
      expect(avgTimePerRequest).toBeLessThan(3000); // Média < 3s em concorrência
      expect(totalTime).toBeLessThan(10000); // Todas em < 10s
      
      logger.info('✅ Teste de concorrência passou', {
        successRate: `${successRate.toFixed(1)}%`,
        avgTime: `${avgTimePerRequest.toFixed(2)}ms`
      });
    });

  });

  /**
   * 🎯 TESTE 2: DOMAIN VALIDATION RATE > 99%
   */
  describe('2. Domain Validation Rate - Requisito > 99%', () => {
    
    it('should achieve > 99% domain validation accuracy', async () => {
      const validator = new SimpleEmailValidator();
      const testCases = [
        // Casos que devem PASSAR (domínios verificados)
        ...context.testDomains.map(domain => ({ domain, userId: context.userId, shouldPass: true })),
        // Casos que devem FALHAR (domínios não verificados)
        { domain: `unverified-${Date.now()}.com`, userId: context.userId, shouldPass: false },
        { domain: `nonexistent-${Date.now()}.com`, userId: context.userId, shouldPass: false },
        { domain: `invalid-${Date.now()}.com`, userId: 99999, shouldPass: false }, // User inexistente
      ];

      logger.info('🧪 Testando precisão da validação de domínios', {
        totalCases: testCases.length,
        expectedToPass: testCases.filter(t => t.shouldPass).length,
        expectedToFail: testCases.filter(t => !t.shouldPass).length
      });

      let correctValidations = 0;
      let totalValidations = 0;
      const results: Array<{ domain: string, expected: boolean, actual: boolean, correct: boolean }> = [];

      for (const testCase of testCases) {
        try {
          const startTime = performance.now();
          const result = await validator.checkDomainOwnership(testCase.domain, testCase.userId);
          const validationTime = performance.now() - startTime;
          
          totalValidations++;
          const isCorrect = result.verified === testCase.shouldPass;
          if (isCorrect) {
            correctValidations++;
          }

          results.push({
            domain: testCase.domain,
            expected: testCase.shouldPass,
            actual: result.verified,
            correct: isCorrect
          });

          logger.debug('Validação de domínio', {
            domain: testCase.domain,
            expected: testCase.shouldPass,
            actual: result.verified,
            correct: isCorrect,
            time: `${validationTime.toFixed(2)}ms`
          });

          // Validação individual de performance
          expect(validationTime).toBeLessThan(1000); // < 1s por validação

        } catch (error) {
          totalValidations++;
          // Erros devem ocorrer apenas para casos inválidos
          const isCorrect = !testCase.shouldPass;
          if (isCorrect) {
            correctValidations++;
          }

          results.push({
            domain: testCase.domain,
            expected: testCase.shouldPass,
            actual: false, // Erro = não verificado
            correct: isCorrect
          });

          logger.debug('Validação com erro (pode ser esperado)', {
            domain: testCase.domain,
            expected: testCase.shouldPass,
            error: error.message,
            correct: isCorrect
          });
        }
      }

      const validationRate = (correctValidations / totalValidations) * 100;

      logger.info('📊 Taxa de Precisão da Validação de Domínios', {
        totalValidations,
        correctValidations,
        validationRate: `${validationRate.toFixed(2)}%`,
        requirement: '> 99%'
      });

      // Mostrar casos que falharam para debugging
      const incorrectCases = results.filter(r => !r.correct);
      if (incorrectCases.length > 0) {
        logger.warn('Casos incorretos encontrados', { incorrectCases });
      }

      // REQUISITO CRÍTICO: > 99% de precisão
      expect(validationRate).toBeGreaterThan(99);
      
      logger.info('✅ Taxa de validação de domínios atendida', {
        validationRate: `${validationRate.toFixed(2)}%`,
        requirement: 'PASSOU'
      });
    });

  });

  /**
   * 🎯 TESTE 3: EMAIL SUCCESS RATE > 95%
   */
  describe('3. Email Success Rate - Requisito > 95%', () => {
    
    it('should achieve > 95% email success rate with verified domains', async () => {
      const testDomain = context.testDomains[2];
      const emailCount = 30;
      let successCount = 0;
      let totalCount = 0;
      const results: Array<{ index: number, success: boolean, time: number, error?: string }> = [];

      logger.info('📧 Testando taxa de sucesso de envio de emails', {
        testDomain,
        emailCount,
        requirement: '> 95%'
      });

      for (let i = 0; i < emailCount; i++) {
        const startTime = performance.now();
        
        try {
          const response = await request(app)
            .post('/api/emails-v2/send-v2')
            .set('Authorization', `Bearer ${context.userToken}`)
            .send({
              from: `success-test-${i}@${testDomain}`,
              to: `recipient-${i}@example.com`,
              subject: `Success Rate Test ${i}`,
              text: `Success rate test email ${i}.`
            });
          
          const requestTime = performance.now() - startTime;
          totalCount++;
          
          const success = response.status === 200;
          if (success) {
            successCount++;
          }

          results.push({
            index: i,
            success,
            time: requestTime,
            error: success ? undefined : response.body?.error || 'Unknown error'
          });

          logger.debug(`Email ${i + 1}/${emailCount}`, {
            success,
            time: `${requestTime.toFixed(2)}ms`,
            status: response.status
          });

        } catch (error) {
          const requestTime = performance.now() - startTime;
          totalCount++;
          
          results.push({
            index: i,
            success: false,
            time: requestTime,
            error: error.message
          });

          logger.debug(`Email ${i + 1}/${emailCount} - Erro`, {
            error: error.message,
            time: `${requestTime.toFixed(2)}ms`
          });
        }

        // Delay pequeno entre emails
        if (i < emailCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successRate = (successCount / totalCount) * 100;
      const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
      const failures = results.filter(r => !r.success);

      logger.info('📊 Taxa de Sucesso de Emails', {
        testDomain,
        totalEmails: totalCount,
        successfulEmails: successCount,
        failedEmails: failures.length,
        successRate: `${successRate.toFixed(2)}%`,
        avgTime: `${avgTime.toFixed(2)}ms`,
        requirement: '> 95%'
      });

      // Mostrar falhas para debugging
      if (failures.length > 0) {
        logger.warn('Emails que falharam', {
          failures: failures.map(f => ({ index: f.index, error: f.error }))
        });
      }

      // REQUISITO CRÍTICO: > 95% success rate
      expect(successRate).toBeGreaterThan(95);
      expect(avgTime).toBeLessThan(2000); // < 2s por envio
      
      logger.info('✅ Taxa de sucesso de emails atendida', {
        successRate: `${successRate.toFixed(2)}%`,
        requirement: 'PASSOU'
      });
    });

  });

  /**
   * 🎯 TESTE 4: STRESS TEST - CARGA ALTA
   */
  describe('4. Stress Test - Comportamento sob Carga', () => {
    
    it('should maintain performance under heavy load', async () => {
      const testDomain = context.testDomains[0];
      const heavyLoad = 100; // Carga pesada
      const batchSize = 10; // Processar em lotes
      
      logger.info('💪 Teste de stress - carga pesada', {
        testDomain,
        totalRequests: heavyLoad,
        batchSize
      });

      const startTime = performance.now();
      let totalSuccessful = 0;
      let totalFailed = 0;
      const batchTimes: number[] = [];

      // Processar em lotes para não sobrecarregar
      for (let batch = 0; batch < heavyLoad / batchSize; batch++) {
        const batchStartTime = performance.now();
        
        const batchPromises = Array.from({ length: batchSize }, (_, i) => {
          const globalIndex = batch * batchSize + i;
          return request(app)
            .post('/api/emails-v2/send-v2')
            .set('Authorization', `Bearer ${context.userToken}`)
            .send({
              from: `stress-${globalIndex}@${testDomain}`,
              to: `recipient-${globalIndex}@example.com`,
              subject: `Stress Test ${globalIndex}`,
              text: `Stress test email ${globalIndex}.`
            });
        });

        const batchResponses = await Promise.allSettled(batchPromises);
        const batchTime = performance.now() - batchStartTime;
        batchTimes.push(batchTime);

        const batchSuccessful = batchResponses.filter(r => 
          r.status === 'fulfilled' && r.value.status === 200
        ).length;

        totalSuccessful += batchSuccessful;
        totalFailed += batchSize - batchSuccessful;

        logger.debug(`Lote ${batch + 1}/${heavyLoad / batchSize}`, {
          batchSuccessful,
          batchFailed: batchSize - batchSuccessful,
          batchTime: `${batchTime.toFixed(2)}ms`
        });

        // Pequena pausa entre lotes
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const totalTime = performance.now() - startTime;
      const successRate = (totalSuccessful / heavyLoad) * 100;
      const avgBatchTime = batchTimes.reduce((sum, time) => sum + time, 0) / batchTimes.length;
      const throughput = heavyLoad / (totalTime / 1000); // Requests per second

      logger.info('📊 Resultados do Stress Test', {
        testDomain,
        totalRequests: heavyLoad,
        successful: totalSuccessful,
        failed: totalFailed,
        successRate: `${successRate.toFixed(2)}%`,
        totalTime: `${(totalTime / 1000).toFixed(2)}s`,
        avgBatchTime: `${avgBatchTime.toFixed(2)}ms`,
        throughput: `${throughput.toFixed(2)} req/s`
      });

      // Validações de stress test
      expect(successRate).toBeGreaterThan(90); // Mínimo 90% sob carga
      expect(avgBatchTime).toBeLessThan(5000); // Lotes < 5s
      expect(throughput).toBeGreaterThan(5); // Mínimo 5 req/s
      
      logger.info('✅ Stress test passou', {
        successRate: `${successRate.toFixed(2)}%`,
        throughput: `${throughput.toFixed(2)} req/s`
      });
    });

  });

});

/**
 * 🛠️ FUNÇÕES AUXILIARES PARA CÁLCULO DE MÉTRICAS
 */

function calculatePerformanceMetrics(times: number[], successCount: number, totalCount: number): PerformanceMetrics {
  const sortedTimes = [...times].sort((a, b) => a - b);
  
  return {
    totalTime: times.reduce((sum, time) => sum + time, 0),
    avgTime: times.reduce((sum, time) => sum + time, 0) / times.length,
    medianTime: sortedTimes[Math.floor(sortedTimes.length / 2)],
    p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
    p99Time: sortedTimes[Math.floor(sortedTimes.length * 0.99)],
    minTime: Math.min(...times),
    maxTime: Math.max(...times),
    successRate: (successCount / totalCount) * 100,
    errorRate: ((totalCount - successCount) / totalCount) * 100
  };
}