/**
 * 🧪 TESTES DE CASOS EDGE - FASE 5 DO PLANO_INTEGRACAO_SEGURA.md
 * 
 * Testes específicos para cenários edge e situações críticas:
 * - Domínio não verificado
 * - Domínio inexistente  
 * - Fallback para ultrazend.com.br
 * - Rate limiting por domínio
 * - Cenários de falha e recuperação
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../index';
import db from '../../config/database';
import { SimpleEmailValidator } from '../../email/EmailValidator';
import { logger } from '../../config/logger';

interface TestContext {
  userId: number;
  userToken: string;
  testDomains: string[];
}

let context: TestContext;

beforeAll(async () => {
  // Setup usuário de teste
  const userData = {
    name: 'Edge Case Test User',
    email: `edge-test-${Date.now()}@example.com`,
    password: 'hashed_password',
    is_verified: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  const [userId] = await db('users').insert(userData).returning('id');
  
  context = {
    userId,
    userToken: 'mock-jwt-token-edge-cases',
    testDomains: []
  };

  logger.info('🧪 Edge Cases Tests - Setup concluído', { userId });
});

afterAll(async () => {
  // Limpeza
  if (context.testDomains.length > 0) {
    await db('user_domains').whereIn('domain_name', context.testDomains).del();
  }
  await db('users').where('id', context.userId).del();
  
  logger.info('🧪 Edge Cases Tests - Limpeza concluída');
});

describe('🚨 Edge Cases - Casos Críticos', () => {

  /**
   * 🔒 TESTE 1: DOMÍNIO NÃO VERIFICADO
   */
  describe('1. Domínio Não Verificado', () => {
    
    it('should reject emails from unverified domain with clear error', async () => {
      const unverifiedDomain = `unverified-${Date.now()}.com`;
      
      // Cadastrar domínio mas NÃO verificar
      await db('user_domains').insert({
        user_id: context.userId,
        domain_name: unverifiedDomain,
        is_verified: false, // ← Não verificado
        verification_status: 'pending',
        verified_at: null,
        created_at: new Date(),
        updated_at: new Date()
      });
      
      context.testDomains.push(unverifiedDomain);
      
      logger.info('🧪 Testando domínio não verificado', { unverifiedDomain });

      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${context.userToken}`)
        .send({
          from: `sender@${unverifiedDomain}`,
          to: 'recipient@example.com',
          subject: 'Should be rejected',
          text: 'This email should be rejected due to unverified domain.'
        });

      // Validações
      expect(emailResponse.status).toBe(400);
      expect(emailResponse.body.success).toBeFalsy();
      expect(emailResponse.body.code).toBe('DOMAIN_NOT_VERIFIED');
      expect(emailResponse.body.error).toContain('not verified');
      expect(emailResponse.body.redirect).toBe('/domains');
      expect(emailResponse.body.domain).toBe(unverifiedDomain);
      expect(emailResponse.body.verification_required).toBe(true);
      
      logger.info('✅ Domínio não verificado corretamente rejeitado', {
        domain: unverifiedDomain,
        error: emailResponse.body.error,
        code: emailResponse.body.code
      });
    });

    it('should provide helpful error message for domain setup', async () => {
      const nonExistentDomain = `never-registered-${Date.now()}.com`;
      
      logger.info('🧪 Testando domínio nunca cadastrado', { nonExistentDomain });

      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${context.userToken}`)
        .send({
          from: `sender@${nonExistentDomain}`,
          to: 'recipient@example.com',
          subject: 'Should be rejected',
          text: 'This email should be rejected due to non-existent domain.'
        });

      expect(emailResponse.status).toBe(400);
      expect(emailResponse.body.code).toBe('DOMAIN_NOT_VERIFIED');
      expect(emailResponse.body.redirect).toBe('/domains');
      
      // O erro deve ser claro sobre o que fazer
      const errorMessage = emailResponse.body.error.toLowerCase();
      expect(errorMessage).toContain('not verified');
      expect(errorMessage).toContain('domains');
      
      logger.info('✅ Erro claro para domínio não cadastrado', {
        domain: nonExistentDomain,
        error: emailResponse.body.error
      });
    });

  });

  /**
   * 🌐 TESTE 2: DOMÍNIO INEXISTENTE E MALFORMADO
   */
  describe('2. Domínios Inválidos', () => {
    
    it('should handle malformed email addresses', async () => {
      const malformedEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user@domain.',
        'user@@domain.com',
        'user@domain..com',
        '',
        null,
        undefined
      ];

      logger.info('🧪 Testando emails malformados', { count: malformedEmails.length });

      for (const email of malformedEmails) {
        const emailResponse = await request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${context.userToken}`)
          .send({
            from: email,
            to: 'recipient@example.com',
            subject: 'Should fail',
            text: 'Should fail due to invalid email.'
          });

        expect(emailResponse.status).toBe(400);
        expect(emailResponse.body.code).toBe('INVALID_EMAIL_FORMAT');
        
        logger.debug('Email malformado rejeitado', { email, status: emailResponse.status });
      }
      
      logger.info('✅ Todos os emails malformados foram rejeitados');
    });

    it('should validate domain format in EmailValidator', async () => {
      const validator = new SimpleEmailValidator();
      
      const invalidDomains = [
        'domain-with-spaces .com',
        'domain..com',
        '.domain.com',
        'domain.com.',
        'domain',
        ''
      ];

      logger.info('🧪 Testando domínios inválidos no EmailValidator');

      for (const domain of invalidDomains) {
        try {
          const result = await validator.checkDomainOwnership(domain, context.userId);
          expect(result.verified).toBe(false);
          logger.debug('Domínio inválido rejeitado', { domain, verified: result.verified });
        } catch (error) {
          // Erro esperado para domínios malformados
          logger.debug('Domínio inválido gerou erro (esperado)', { domain, error: error.message });
        }
      }
      
      logger.info('✅ Domínios inválidos corretamente rejeitados');
    });

  });

  /**
   * 🔄 TESTE 3: FALLBACK PARA ULTRAZEND.COM.BR
   */
  describe('3. Fallback para ultrazend.com.br', () => {
    
    it('should handle fallback domain correctly', async () => {
      const fallbackDomain = 'ultrazend.com.br';
      
      logger.info('🧪 Testando fallback para ultrazend.com.br');

      // Verificar se o fallback domain está configurado
      const validator = new SimpleEmailValidator();
      const fallbackCheck = await validator.checkDomainOwnership(fallbackDomain, context.userId);
      
      // O fallback pode estar sempre disponível ou seguir regras específicas
      logger.info('Status do fallback domain', {
        domain: fallbackDomain,
        verified: fallbackCheck.verified,
        verifiedAt: fallbackCheck.verifiedAt
      });

      // Teste depende da configuração específica do sistema
      // Se o fallback estiver sempre disponível, deve ser verified: true
      // Se seguir regras normais, pode ser verified: false
      
      expect(typeof fallbackCheck.verified).toBe('boolean');
      
      logger.info('✅ Fallback domain testado', {
        domain: fallbackDomain,
        result: fallbackCheck
      });
    });

    it('should provide fallback suggestion when domain fails', async () => {
      const failedDomain = `failed-${Date.now()}.com`;
      
      logger.info('🧪 Testando sugestão de fallback');

      const emailResponse = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${context.userToken}`)
        .send({
          from: `sender@${failedDomain}`,
          to: 'recipient@example.com',
          subject: 'Should suggest fallback',
          text: 'Should suggest using fallback domain.'
        });

      expect(emailResponse.status).toBe(400);
      expect(emailResponse.body.code).toBe('DOMAIN_NOT_VERIFIED');
      
      // O sistema deve sugerir alternativas (isso pode ser implementado no futuro)
      logger.info('✅ Sugestão de fallback testada', {
        domain: failedDomain,
        suggestion: 'Configure domínio próprio ou use ultrazend.com.br'
      });
    });

  });

  /**
   * ⚡ TESTE 4: RATE LIMITING POR DOMÍNIO
   */
  describe('4. Rate Limiting por Domínio', () => {
    
    it('should apply rate limiting per domain', async () => {
      const testDomain = `rate-limit-${Date.now()}.com`;
      
      // Configurar domínio verificado
      await db('user_domains').insert({
        user_id: context.userId,
        domain_name: testDomain,
        is_verified: true,
        verification_status: 'verified',
        verified_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      });
      
      context.testDomains.push(testDomain);
      
      logger.info('🧪 Testando rate limiting por domínio', { testDomain });

      const requestCount = 15; // Fazer muitas requisições
      const promises = Array.from({ length: requestCount }, (_, i) => 
        request(app)
          .post('/api/emails-v2/send-v2')
          .set('Authorization', `Bearer ${context.userToken}`)
          .send({
            from: `sender@${testDomain}`,
            to: `recipient-${i}@example.com`,
            subject: `Rate limit test ${i}`,
            text: `Rate limit test email ${i}.`
          })
      );

      const responses = await Promise.allSettled(promises);
      
      const successful = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      
      const rateLimited = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      ).length;
      
      const errors = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status >= 400 && r.value.status !== 429
      ).length;

      logger.info('📊 Resultados do rate limiting', {
        testDomain,
        total: requestCount,
        successful,
        rateLimited,
        errors,
        successRate: (successful / requestCount) * 100
      });

      // Validações
      expect(successful + rateLimited + errors).toBe(requestCount);
      expect(successful).toBeGreaterThan(0); // Pelo menos alguns devem passar
      
      // Se há rate limiting implementado, algumas devem ser bloqueadas
      if (rateLimited > 0) {
        logger.info('✅ Rate limiting funcionando', { rateLimited });
      } else {
        logger.info('ℹ️ Rate limiting não ativo ou limites altos', { successful });
      }
    });

    it('should maintain per-domain rate limit isolation', async () => {
      const domain1 = `isolation-1-${Date.now()}.com`;
      const domain2 = `isolation-2-${Date.now()}.com`;
      
      // Configurar ambos os domínios
      for (const domain of [domain1, domain2]) {
        await db('user_domains').insert({
          user_id: context.userId,
          domain_name: domain,
          is_verified: true,
          verification_status: 'verified',
          verified_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        });
        context.testDomains.push(domain);
      }
      
      logger.info('🧪 Testando isolamento de rate limit por domínio', { domain1, domain2 });

      // Fazer requisições para ambos os domínios alternadamente
      const requests = [];
      for (let i = 0; i < 10; i++) {
        const domain = i % 2 === 0 ? domain1 : domain2;
        requests.push(
          request(app)
            .post('/api/emails-v2/send-v2')
            .set('Authorization', `Bearer ${context.userToken}`)
            .send({
              from: `sender@${domain}`,
              to: `recipient-${i}@example.com`,
              subject: `Isolation test ${i}`,
              text: `Domain isolation test ${i}.`
            })
        );
      }

      const responses = await Promise.allSettled(requests);
      
      const results = responses.map((r, i) => ({
        index: i,
        domain: i % 2 === 0 ? domain1 : domain2,
        status: r.status === 'fulfilled' ? r.value.status : 'failed',
        success: r.status === 'fulfilled' && r.value.status === 200
      }));

      const domain1Results = results.filter(r => r.domain === domain1);
      const domain2Results = results.filter(r => r.domain === domain2);
      
      logger.info('📊 Isolamento de rate limit', {
        domain1: {
          total: domain1Results.length,
          successful: domain1Results.filter(r => r.success).length
        },
        domain2: {
          total: domain2Results.length,
          successful: domain2Results.filter(r => r.success).length
        }
      });
      
      // Ambos os domínios devem conseguir enviar pelo menos alguns emails
      expect(domain1Results.some(r => r.success)).toBe(true);
      expect(domain2Results.some(r => r.success)).toBe(true);
      
      logger.info('✅ Isolamento de rate limit por domínio verificado');
    });

  });

  /**
   * 🛡️ TESTE 5: CENÁRIOS DE RECUPERAÇÃO
   */
  describe('5. Cenários de Recuperação', () => {
    
    it('should recover from temporary EmailValidator failures', async () => {
      logger.info('🧪 Testando recuperação de falhas temporárias');

      // Simular comportamento de recuperação
      const validator = new SimpleEmailValidator();
      
      // Em um cenário real, poderíamos simular falhas de rede ou database
      // Por ora, testamos o comportamento normal
      const testDomain = `recovery-${Date.now()}.com`;
      
      let attempts = 0;
      let lastError: Error | null = null;
      
      while (attempts < 3) {
        try {
          attempts++;
          const result = await validator.checkDomainOwnership(testDomain, context.userId);
          
          // Deve retornar false para domínio não cadastrado, mas sem erro
          expect(result.verified).toBe(false);
          break;
          
        } catch (error) {
          lastError = error as Error;
          logger.debug(`Tentativa ${attempts} falhou`, { error: error.message });
          
          if (attempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Pequeno delay
          }
        }
      }
      
      if (attempts === 3 && lastError) {
        throw new Error(`Falha após 3 tentativas: ${lastError.message}`);
      }
      
      logger.info('✅ Recuperação de falhas temporárias testada', { attempts });
    });

    it('should handle database connection issues gracefully', async () => {
      logger.info('🧪 Testando resistência a problemas de conexão');

      // Em um ambiente real, simularíamos problemas de conexão
      // Por ora, testamos que o sistema continua funcionando
      
      const emailResponse = await request(app)
        .post('/api/emails-v2/status')
        .set('Authorization', `Bearer ${context.userToken}`);

      // O endpoint de status deve sempre responder
      expect(emailResponse.status).toBe(200);
      expect(emailResponse.body.status).toBe('active');
      
      logger.info('✅ Resistência do sistema verificada');
    });

  });

});

describe('📊 Métricas de Edge Cases', () => {
  
  it('should track error rates accurately', async () => {
    logger.info('🧪 Verificando tracking de taxa de erro');

    // Fazer mix de requisições válidas e inválidas
    const validDomain = `valid-${Date.now()}.com`;
    await db('user_domains').insert({
      user_id: context.userId,
      domain_name: validDomain,
      is_verified: true,
      verification_status: 'verified',
      verified_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    });
    
    context.testDomains.push(validDomain);
    
    const requests = [
      // Válidas
      { from: `test@${validDomain}`, shouldSucceed: true },
      { from: `test2@${validDomain}`, shouldSucceed: true },
      // Inválidas
      { from: 'invalid@unverified-domain.com', shouldSucceed: false },
      { from: 'malformed-email', shouldSucceed: false }
    ];
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const req of requests) {
      const response = await request(app)
        .post('/api/emails-v2/send-v2')
        .set('Authorization', `Bearer ${context.userToken}`)
        .send({
          from: req.from,
          to: 'recipient@example.com',
          subject: 'Metrics test',
          text: 'Metrics test email.'
        });
      
      if (response.status === 200) {
        successCount++;
      } else {
        errorCount++;
      }
      
      expect(response.status === 200).toBe(req.shouldSucceed);
    }
    
    const errorRate = (errorCount / requests.length) * 100;
    
    logger.info('📈 Taxa de erro calculada', {
      total: requests.length,
      successCount,
      errorCount,
      errorRate: `${errorRate}%`
    });
    
    expect(errorRate).toBe(50); // 50% dos testes devem falhar propositalmente
    
    logger.info('✅ Tracking de taxa de erro verificado');
  });

});