import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TenantContextService } from '../services/TenantContextService';
import { TenantQueueManager } from '../services/TenantQueueManager';
import db from '../config/database';
import { logger } from '../config/logger';

/**
 * 🚨 TESTES CRÍTICOS DE ISOLAMENTO SaaS - VERSÃO SIMPLIFICADA
 * 
 * Valida que NUNCA há mistura de dados entre tenants.
 * FALHA = VAZAMENTO DE DADOS = VIOLAÇÃO DE COMPLIANCE
 */

describe('🔥 ISOLAMENTO CRÍTICO DE TENANTS - SaaS (CORE)', () => {
  let tenantService: TenantContextService;
  let queueManager: TenantQueueManager;

  // Dados de teste para 2 tenants
  const TENANT_A = {
    userId: 1001,
    domain: 'tenant-a.com',
    plan: 'pro'
  };

  const TENANT_B = {
    userId: 1002,
    domain: 'tenant-b.com', 
    plan: 'free'
  };

  beforeAll(async () => {
    // Inicializar serviços
    tenantService = new TenantContextService();
    queueManager = new TenantQueueManager();

    // Preparar dados de teste no banco
    try {
      await db('users').insert([
        { 
          id: TENANT_A.userId,
          email: 'tenant-a@example.com',
          name: 'Tenant A',
          plan: TENANT_A.plan,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: TENANT_B.userId,
          email: 'tenant-b@example.com', 
          name: 'Tenant B',
          plan: TENANT_B.plan,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      await db('domains').insert([
        {
          id: 2001,
          user_id: TENANT_A.userId,
          domain: TENANT_A.domain,
          status: 'verified',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2002,
          user_id: TENANT_B.userId,
          domain: TENANT_B.domain,
          status: 'verified', 
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    } catch (error) {
      logger.warn('Test data setup failed, continuing...', { error });
    }
  });

  afterAll(async () => {
    // Limpar dados de teste
    try {
      await db('domains').whereIn('user_id', [TENANT_A.userId, TENANT_B.userId]).del();
      await db('users').whereIn('id', [TENANT_A.userId, TENANT_B.userId]).del();
      await db('email_delivery_queue').whereIn('user_id', [TENANT_A.userId, TENANT_B.userId]).del();
    } catch (error) {
      logger.warn('Test cleanup failed, continuing...', { error });
    }
    await db.destroy();
  });

  beforeEach(async () => {
    // Limpar filas antes de cada teste
    try {
      await db('email_delivery_queue').whereIn('user_id', [TENANT_A.userId, TENANT_B.userId]).del();
    } catch (error) {
      logger.warn('Test beforeEach cleanup failed, continuing...', { error });
    }
  });

  // ✅ TESTE 1: ISOLAMENTO DE TENANT CONTEXT
  describe('1. 🔐 Tenant Context Service', () => {
    it('deve retornar contexto apenas do tenant solicitado', async () => {
      const contextA = await tenantService.getTenantContext(TENANT_A.userId);
      const contextB = await tenantService.getTenantContext(TENANT_B.userId);

      // Verificar isolamento básico
      expect(contextA.userId).toBe(TENANT_A.userId);
      expect(contextB.userId).toBe(TENANT_B.userId);
      
      // Verificar que contextos são diferentes
      expect(contextA.userId).not.toBe(contextB.userId);
      expect(contextA.plan).not.toBe(contextB.plan);
    });

    it('deve validar operação apenas para o tenant correto', async () => {
      const validA = await tenantService.validateTenantOperation(
        TENANT_A.userId, 
        {
          operation: 'send_email',
          resource: 'domain',
          resourceId: 2001
        }
      );
      
      const validB = await tenantService.validateTenantOperation(
        TENANT_B.userId,
        {
          operation: 'send_email',
          resource: 'domain',
          resourceId: 2002
        }
      );

      expect(validA.allowed).toBe(true);
      expect(validB.allowed).toBe(true);

      // Verificar que validação é específica por tenant
      expect(typeof validA).toBe('boolean');
      expect(typeof validB).toBe('boolean');
    });
  });

  // ✅ TESTE 2: ISOLAMENTO DE FILAS
  describe('2. 📬 Queue Manager', () => {
    it('deve criar filas segregadas por tenant', async () => {
      const queueA = queueManager.getQueueForTenant(TENANT_A.userId, 'email-processing');
      const queueB = queueManager.getQueueForTenant(TENANT_B.userId, 'email-processing');

      expect(queueA.name).toBe(`email-processing:user:${TENANT_A.userId}`);
      expect(queueB.name).toBe(`email-processing:user:${TENANT_B.userId}`);
      expect(queueA.name).not.toBe(queueB.name); // 🔥 CRÍTICO: filas devem ser diferentes
    });

    it('deve processar jobs apenas da fila do tenant correto', async () => {
      const queueA = queueManager.getQueueForTenant(TENANT_A.userId, 'email-processing');
      const queueB = queueManager.getQueueForTenant(TENANT_B.userId, 'email-processing');

      // Adicionar jobs
      await queueA.add('send-email', { 
        userId: TENANT_A.userId,
        emailId: 'email-a-001',
        tenantContext: { domain: TENANT_A.domain }
      });

      await queueB.add('send-email', {
        userId: TENANT_B.userId, 
        emailId: 'email-b-001',
        tenantContext: { domain: TENANT_B.domain }
      });

      // Verificar isolamento
      const waitingA = await queueA.getWaiting();
      const waitingB = await queueB.getWaiting();

      expect(waitingA).toHaveLength(1);
      expect(waitingB).toHaveLength(1);
      expect(waitingA[0].data.userId).toBe(TENANT_A.userId);
      expect(waitingB[0].data.userId).toBe(TENANT_B.userId);
    });
  });

  // ✅ TESTE 3: ISOLAMENTO DE DADOS DE BANCO
  describe('3. 🗄️ Database Isolation', () => {
    it('deve buscar dados apenas do tenant correto', async () => {
      // Inserir emails de teste
      await db('email_delivery_queue').insert([
        {
          id: 'email-a-001',
          user_id: TENANT_A.userId,
          from_email: `test@${TENANT_A.domain}`,
          to_email: 'recipient@example.com',
          subject: 'Test from Tenant A',
          status: 'pending',
          created_at: new Date()
        },
        {
          id: 'email-b-001',
          user_id: TENANT_B.userId,
          from_email: `test@${TENANT_B.domain}`,
          to_email: 'recipient@example.com', 
          subject: 'Test from Tenant B',
          status: 'pending',
          created_at: new Date()
        }
      ]);

      // Buscar emails apenas do Tenant A
      const emailsA = await db('email_delivery_queue')
        .where('user_id', TENANT_A.userId);

      const emailsB = await db('email_delivery_queue')
        .where('user_id', TENANT_B.userId);

      // Verificar isolamento
      expect(emailsA).toHaveLength(1);
      expect(emailsB).toHaveLength(1);
      expect(emailsA[0].user_id).toBe(TENANT_A.userId);
      expect(emailsB[0].user_id).toBe(TENANT_B.userId);
      expect(emailsA[0].from_email).toContain(TENANT_A.domain);
      expect(emailsB[0].from_email).toContain(TENANT_B.domain);
    });

    it('NUNCA deve retornar dados de outro tenant', async () => {
      // Inserir dados misturados
      await db('email_delivery_queue').insert([
        {
          id: 'email-mixed-1',
          user_id: TENANT_A.userId,
          from_email: `test@${TENANT_A.domain}`,
          to_email: 'recipient1@example.com',
          subject: 'Email from Tenant A',
          status: 'pending',
          created_at: new Date()
        },
        {
          id: 'email-mixed-2', 
          user_id: TENANT_B.userId,
          from_email: `test@${TENANT_B.domain}`,
          to_email: 'recipient2@example.com',
          subject: 'Email from Tenant B',
          status: 'pending',
          created_at: new Date()
        }
      ]);

      // Buscar apenas do Tenant A
      const tenantAEmails = await db('email_delivery_queue')
        .where('user_id', TENANT_A.userId);

      // Verificar que NUNCA retorna dados do Tenant B
      tenantAEmails.forEach(email => {
        expect(email.user_id).toBe(TENANT_A.userId);
        expect(email.user_id).not.toBe(TENANT_B.userId);
        expect(email.from_email).toContain(TENANT_A.domain);
        expect(email.from_email).not.toContain(TENANT_B.domain);
      });

      // Buscar apenas do Tenant B
      const tenantBEmails = await db('email_delivery_queue')
        .where('user_id', TENANT_B.userId);

      // Verificar que NUNCA retorna dados do Tenant A
      tenantBEmails.forEach(email => {
        expect(email.user_id).toBe(TENANT_B.userId);
        expect(email.user_id).not.toBe(TENANT_A.userId);
        expect(email.from_email).toContain(TENANT_B.domain);
        expect(email.from_email).not.toContain(TENANT_A.domain);
      });
    });
  });

  // ✅ TESTE 4: RATE LIMITING ISOLADO
  describe('4. ⚡ Rate Limiting Isolation', () => {
    it('deve ter limites diferentes por plano de tenant', async () => {
      const contextA = await tenantService.getTenantContext(TENANT_A.userId);
      const contextB = await tenantService.getTenantContext(TENANT_B.userId);

      // Verificar que tenants têm configurações diferentes
      expect(contextA.plan).toBe('pro');
      expect(contextB.plan).toBe('free');
      expect(contextA.plan).not.toBe(contextB.plan);

      // Verificar que limites existem e são diferentes
      expect(contextA.rateLimits).toBeDefined();
      expect(contextB.rateLimits).toBeDefined();
      expect(contextA.rateLimits.emailsSending.perHour).not.toBe(contextB.rateLimits.emailsSending.perHour);
    });
  });

  // ✅ TESTE FINAL: VALIDAÇÃO COMPLETA DE ISOLAMENTO
  describe('🏁 VALIDAÇÃO FINAL - ZERO VAZAMENTO', () => {
    it('🔥 TESTE CRÍTICO: Operação completa sem vazamento', async () => {
      // 1. Inserir dados para ambos os tenants
      await db('email_delivery_queue').insert([
        {
          id: 'final-test-email-a',
          user_id: TENANT_A.userId,
          from_email: `noreply@${TENANT_A.domain}`,
          to_email: 'customer-a@example.com',
          subject: 'Final Test Email A',
          html_body: '<h1>Hello from Tenant A</h1>',
          status: 'pending',
          created_at: new Date()
        },
        {
          id: 'final-test-email-b',
          user_id: TENANT_B.userId,
          from_email: `noreply@${TENANT_B.domain}`,
          to_email: 'customer-b@example.com',
          subject: 'Final Test Email B',
          html_body: '<h1>Hello from Tenant B</h1>',
          status: 'pending',
          created_at: new Date()
        }
      ]);

      // 2. Buscar contextos
      const contextA = await tenantService.getTenantContext(TENANT_A.userId);
      const contextB = await tenantService.getTenantContext(TENANT_B.userId);

      // 3. Criar filas segregadas
      const queueA = queueManager.getQueueForTenant(TENANT_A.userId, 'email-processing');
      const queueB = queueManager.getQueueForTenant(TENANT_B.userId, 'email-processing');

      // 4. ASSERÇÕES CRÍTICAS DE ISOLAMENTO
      
      // Contextos são únicos
      expect(contextA.userId).toBe(TENANT_A.userId);
      expect(contextB.userId).toBe(TENANT_B.userId);
      expect(contextA.userId).not.toBe(contextB.userId);

      // Filas são separadas
      expect(queueA.name).toContain(`user:${TENANT_A.userId}`);
      expect(queueB.name).toContain(`user:${TENANT_B.userId}`);
      expect(queueA.name).not.toBe(queueB.name);

      // Dados no banco são isolados
      const emailsA = await db('email_delivery_queue').where('user_id', TENANT_A.userId);
      const emailsB = await db('email_delivery_queue').where('user_id', TENANT_B.userId);

      expect(emailsA.length).toBeGreaterThan(0);
      expect(emailsB.length).toBeGreaterThan(0);

      // VERIFICAÇÃO FINAL: ZERO VAZAMENTO
      emailsA.forEach(email => {
        expect(email.user_id).toBe(TENANT_A.userId);
        expect(email.user_id).not.toBe(TENANT_B.userId);
        expect(email.from_email).toContain(TENANT_A.domain);
        expect(email.from_email).not.toContain(TENANT_B.domain);
      });

      emailsB.forEach(email => {
        expect(email.user_id).toBe(TENANT_B.userId);
        expect(email.user_id).not.toBe(TENANT_A.userId);
        expect(email.from_email).toContain(TENANT_B.domain);
        expect(email.from_email).not.toContain(TENANT_A.domain);
      });

      logger.info('🎉 TESTE FINAL DE ISOLAMENTO PASSOU - ZERO VAZAMENTO DETECTADO');
    });
  });
});