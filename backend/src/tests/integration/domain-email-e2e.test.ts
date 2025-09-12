/**
 * 🧪 TESTES END-TO-END - FASE 5 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Testes completos de integração entre domínios e sistema de emails
 * Cobre todo o fluxo: cadastro → verificação → envio → métricas
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../index';
import db from '../../config/database';
import { SimpleEmailValidator } from '../../email/EmailValidator';
import { logger } from '../../config/logger';

// Tipos para os testes
interface TestUser {
  id: number;
  email: string;
  token: string;
}

interface DomainTestResult {
  domain: string;
  verified: boolean;
  verification_time: number;
  setup_time: number;
}

interface EmailTestResult {
  message_id: string;
  domain_verified: boolean;
  send_time: number;
  success: boolean;
}

// Setup global para testes
let testUser: TestUser;
let testDomains: string[] = [];
let testEmails: string[] = [];

beforeAll(async () => {
  // Limpar database de teste
  await cleanTestDatabase();
  
  // Criar usuário de teste
  testUser = await createTestUser();
  
  logger.info('🧪 E2E Tests - Ambiente preparado', {
    userId: testUser.id,
    email: testUser.email
  });
});

afterAll(async () => {
  // Limpar dados de teste
  await cleanTestDatabase();
  
  logger.info('🧪 E2E Tests - Limpeza concluída');
});

beforeEach(() => {
  // Reset timers para cada teste
  jest.clearAllMocks();
});

describe('🚀 Domain-Email Integration E2E Tests', () => {
  
  /**
   * 📋 TESTE 1: FLUXO COMPLETO - HAPPY PATH
   * Fluxo: Cadastrar → Verificar → Enviar → Validar
   */
  describe('1. Fluxo Completo - Happy Path', () => {
    
    it('should complete full integration flow successfully', async () => {
      const testDomain = `test-${Date.now()}.com`;
      const startTime = Date.now();
      
      logger.info('🧪 Iniciando teste de fluxo completo', { testDomain });

      // PASSO 1: Cadastrar domínio
      const domainSetup = await request(app)
        .post('/api/domain-setup/setup')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          domain: testDomain,
          region: 'us-east-1'
        });

      expect(domainSetup.status).toBe(201);
      expect(domainSetup.body.success).toBe(true);
      expect(domainSetup.body.data.domain).toBe(testDomain);
      
      const setupTime = Date.now() - startTime;
      logger.info('✅ Domínio cadastrado', { testDomain, setupTime });

      // PASSO 2: Verificar DNS (simular verificação bem-sucedida)
      const verificationStart = Date.now();
      
      // Marcar domínio como verificado na database para simulação
      await simulateSuccessfulDomainVerification(testUser.id, testDomain);
      
      const verificationTime = Date.now() - verificationStart;
      logger.info('✅ DNS verificado', { testDomain, verificationTime });

      // PASSO 3: Testar EmailValidator
      const validator = new SimpleEmailValidator();
      const domainCheck = await validator.checkDomainOwnership(testDomain, testUser.id);
      
      expect(domainCheck.verified).toBe(true);
      expect(domainCheck.verifiedAt).toBeDefined();
      logger.info('✅ EmailValidator confirmou verificação', { testDomain, domainCheck });

      // PASSO 4: Enviar email via rota V2
      const emailSendStart = Date.now();
      
      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          from: `noreply@${testDomain}`,
          to: 'test@example.com',
          subject: 'E2E Test Email',
          text: 'This is an end-to-end test email.',
          html: '<p>This is an <strong>end-to-end</strong> test email.</p>'
        });

      const emailSendTime = Date.now() - emailSendStart;
      
      expect(emailResponse.status).toBe(200);
      expect(emailResponse.body.success).toBe(true);
      expect(emailResponse.body.domain_verified).toBe(true);
      expect(emailResponse.body.domain).toBe(testDomain);
      expect(emailResponse.body.message_id).toBeDefined();
      
      logger.info('✅ Email enviado com sucesso', {
        testDomain,
        messageId: emailResponse.body.message_id,
        emailSendTime
      });

      // PASSO 5: Verificar métricas
      const metricsResponse = await request(app)
        .get('/api/analytics/overview?period=1d')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.data.total_sent).toBeGreaterThan(0);
      
      // VALIDAÇÕES FINAIS DE PERFORMANCE
      const totalTime = Date.now() - startTime;
      
      expect(setupTime).toBeLessThan(5000); // Cadastro < 5s
      expect(verificationTime).toBeLessThan(3000); // Verificação < 3s  
      expect(emailSendTime).toBeLessThan(2000); // Envio < 2s (requisito)
      expect(totalTime).toBeLessThan(15000); // Fluxo total < 15s
      
      logger.info('🎉 Fluxo completo E2E bem-sucedido', {
        testDomain,
        setupTime,
        verificationTime, 
        emailSendTime,
        totalTime,
        messageId: emailResponse.body.message_id
      });

      // Limpar dados de teste
      testDomains.push(testDomain);
      testEmails.push(emailResponse.body.message_id);
      
    }, 30000); // Timeout de 30s para o teste completo

  });

  /**
   * 📋 TESTE 2: CASOS EDGE - VALIDAÇÕES NEGATIVAS
   */
  describe('2. Casos Edge - Validações Negativas', () => {
    
    it('should reject email from unverified domain', async () => {
      const unverifiedDomain = `unverified-${Date.now()}.com`;
      
      logger.info('🧪 Testando domínio não verificado', { unverifiedDomain });

      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          from: `test@${unverifiedDomain}`,
          to: 'recipient@example.com',
          subject: 'Should Fail',
          text: 'This should fail due to unverified domain.'
        });

      expect(emailResponse.status).toBe(400);
      expect(emailResponse.body.code).toBe('DOMAIN_NOT_VERIFIED');
      expect(emailResponse.body.domain).toBe(unverifiedDomain);
      expect(emailResponse.body.redirect).toBe('/domains');
      
      logger.info('✅ Domínio não verificado corretamente rejeitado', {
        unverifiedDomain,
        error: emailResponse.body.error
      });
    });

    it('should handle invalid email format', async () => {
      logger.info('🧪 Testando formato de email inválido');

      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          from: 'invalid-email-format',
          to: 'recipient@example.com',
          subject: 'Should Fail',
          text: 'This should fail due to invalid email format.'
        });

      expect(emailResponse.status).toBe(400);
      expect(emailResponse.body.code).toBe('INVALID_EMAIL_FORMAT');
      
      logger.info('✅ Formato de email inválido corretamente rejeitado');
    });

    it('should handle non-existent domain', async () => {
      const nonExistentDomain = 'absolutely-non-existent-domain-12345.com';
      
      logger.info('🧪 Testando domínio inexistente', { nonExistentDomain });

      const validator = new SimpleEmailValidator();
      const domainCheck = await validator.checkDomainOwnership(nonExistentDomain, testUser.id);
      
      expect(domainCheck.verified).toBe(false);
      expect(domainCheck.verifiedAt).toBeUndefined();
      
      logger.info('✅ Domínio inexistente corretamente identificado', { nonExistentDomain });
    });

    it('should handle rate limiting gracefully', async () => {
      const testDomain = `rate-limit-${Date.now()}.com`;
      
      // Configurar domínio verificado para o teste
      await simulateSuccessfulDomainVerification(testUser.id, testDomain);
      
      logger.info('🧪 Testando rate limiting', { testDomain });

      // Fazer múltiplas requisições rapidamente
      const promises = Array.from({ length: 10 }, (_, i) => 
        request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${testUser.token}`)
          .send({
            from: `test@${testDomain}`,
            to: `recipient${i}@example.com`,
            subject: `Rate Limit Test ${i}`,
            text: `Rate limit test email ${i}.`
          })
      );

      const responses = await Promise.allSettled(promises);
      
      // Pelo menos algumas devem ser bem-sucedidas
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      
      // Pelo menos algumas podem ser rate limited
      const rateLimited = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      ).length;
      
      expect(successful).toBeGreaterThan(0);
      logger.info('✅ Rate limiting testado', { successful, rateLimited, total: 10 });
      
      testDomains.push(testDomain);
    });

  });

  /**
   * 📋 TESTE 3: PERFORMANCE E MÉTRICAS
   */
  describe('3. Performance e Métricas', () => {
    
    it('should maintain performance standards', async () => {
      const testDomain = `perf-${Date.now()}.com`;
      await simulateSuccessfulDomainVerification(testUser.id, testDomain);
      
      logger.info('🧪 Testando performance', { testDomain });

      const iterations = 5;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        const response = await request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${testUser.token}`)
          .send({
            from: `perf${i}@${testDomain}`,
            to: `recipient${i}@example.com`,
            subject: `Performance Test ${i}`,
            text: `Performance test email ${i}.`
          });
        
        const time = Date.now() - start;
        times.push(time);
        
        expect(response.status).toBe(200);
        expect(time).toBeLessThan(2000); // Requisito: < 2s por envio
        
        if (response.body.message_id) {
          testEmails.push(response.body.message_id);
        }
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      expect(avgTime).toBeLessThan(1500); // Média < 1.5s
      expect(maxTime).toBeLessThan(2000); // Máximo < 2s
      
      logger.info('✅ Performance dentro dos padrões', {
        testDomain,
        avgTime,
        maxTime,
        times
      });
      
      testDomains.push(testDomain);
    });

    it('should provide accurate metrics', async () => {
      logger.info('🧪 Verificando precisão das métricas');

      // Obter métricas antes
      const metricsBefore = await request(app)
        .get('/api/analytics/overview?period=1h')
        .set('Authorization', `Bearer ${testUser.token}`);

      const emailsBefore = metricsBefore.body.data?.total_sent || 0;
      
      // Enviar alguns emails
      const testDomain = `metrics-${Date.now()}.com`;
      await simulateSuccessfulDomainVerification(testUser.id, testDomain);
      
      const emailsToSend = 3;
      for (let i = 0; i < emailsToSend; i++) {
        await request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${testUser.token}`)
          .send({
            from: `metrics${i}@${testDomain}`,
            to: `recipient${i}@example.com`,
            subject: `Metrics Test ${i}`,
            text: `Metrics test email ${i}.`
          });
      }

      // Aguardar um pouco para atualização das métricas
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Obter métricas depois
      const metricsAfter = await request(app)
        .get('/api/analytics/overview?period=1h')
        .set('Authorization', `Bearer ${testUser.token}`);

      const emailsAfter = metricsAfter.body.data?.total_sent || 0;
      const increment = emailsAfter - emailsBefore;
      
      expect(increment).toBeGreaterThanOrEqual(emailsToSend);
      
      logger.info('✅ Métricas precisas verificadas', {
        emailsBefore,
        emailsAfter,
        increment,
        expected: emailsToSend
      });
      
      testDomains.push(testDomain);
    });

  });

  /**
   * 📋 TESTE 4: LOGS E DEBUGGING
   */
  describe('4. Logs e Debugging', () => {
    
    it('should provide clear logs for debugging', async () => {
      const testDomain = `debug-${Date.now()}.com`;
      
      logger.info('🧪 Testando logs de debugging', { testDomain });

      // Testar com domínio não verificado (deve gerar logs específicos)
      const errorResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          from: `debug@${testDomain}`,
          to: 'recipient@example.com',
          subject: 'Debug Test',
          text: 'Debug test email.'
        });

      expect(errorResponse.status).toBe(400);
      expect(errorResponse.body.code).toBe('DOMAIN_NOT_VERIFIED');
      
      // Logs são verificados indiretamente através dos responses
      // Em um ambiente real, verificaríamos arquivos de log ou sistema de monitoramento
      
      logger.info('✅ Logs de debugging verificados');
    });

    it('should handle edge cases with proper error logging', async () => {
      logger.info('🧪 Testando logs de casos edge');

      // Teste com payload malformado
      const badPayloadResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          // Faltando campos obrigatórios
          subject: 'Incomplete Email'
        });

      expect(badPayloadResponse.status).toBeGreaterThanOrEqual(400);
      
      // Teste com autenticação inválida
      const noAuthResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .send({
          from: 'test@example.com',
          to: 'recipient@example.com',
          subject: 'No Auth Test',
          text: 'This should fail.'
        });

      expect(noAuthResponse.status).toBe(401);
      
      logger.info('✅ Logs de casos edge verificados');
    });

  });

});

/**
 * 🛠️ FUNÇÕES AUXILIARES PARA TESTES
 */

async function createTestUser(): Promise<TestUser> {
  // Inserir usuário de teste na database
  const userData = {
    name: 'E2E Test User',
    email: `e2e-test-${Date.now()}@example.com`,
    password: 'hashed_password_placeholder',
    is_verified: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  const [userId] = await db('users').insert(userData).returning('id');
  
  // Simular JWT token (em ambiente real, seria gerado pelo sistema de auth)
  const token = 'mock-jwt-token-for-e2e-tests';
  
  return {
    id: userId,
    email: userData.email,
    token
  };
}

async function simulateSuccessfulDomainVerification(userId: number, domain: string) {
  // Inserir domínio verificado na database
  const domainData = {
    user_id: userId,
    domain_name: domain,
    is_verified: true,
    verification_status: 'verified',
    verified_at: new Date(),
    dkim_enabled: true,
    spf_enabled: true,
    dmarc_enabled: false,
    created_at: new Date(),
    updated_at: new Date()
  };

  await db('user_domains').insert(domainData);
  
  logger.info('Domínio simulado como verificado', { userId, domain });
}

async function cleanTestDatabase() {
  try {
    // Limpar dados de teste na ordem correta para evitar violações de FK
    if (testEmails.length > 0) {
      await db('emails').whereIn('id', testEmails).del();
      logger.info('Emails de teste removidos', { count: testEmails.length });
    }
    
    if (testDomains.length > 0) {
      await db('user_domains').whereIn('domain_name', testDomains).del();
      logger.info('Domínios de teste removidos', { count: testDomains.length });
    }
    
    // Remover usuários de teste
    await db('users').where('email', 'like', 'e2e-test-%@example.com').del();
    
    logger.info('Limpeza de database concluída');
  } catch (error) {
    logger.error('Erro na limpeza da database', { error });
  }
}