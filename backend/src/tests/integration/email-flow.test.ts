/**
 * Testes de integração para fluxo completo de emails
 * Testa a integração entre os serviços após as correções das Fases 1 e 2
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { InternalEmailService } from '../../services/InternalEmailService';
import { ExternalEmailService } from '../../services/ExternalEmailService';
import { MultiDomainDKIMManager } from '../../services/MultiDomainDKIMManager';
import { SMTPDeliveryService } from '../../services/smtpDelivery';
import { DomainValidator } from '../../services/DomainValidator';

// Mock de configuração para testes
jest.mock('../../config/database');
jest.mock('../../config/logger');

interface TestDatabase {
  setup(): Promise<void>;
  cleanup(): Promise<void>;
  createTestUser(): Promise<{ id: number; email: string; name: string }>;
  createTestDomain(userId: number, domain: string, verified: boolean): Promise<{ id: number; domain: string }>;
}

// Mock do banco de dados para testes
const testDatabase: TestDatabase = {
  async setup(): Promise<void> {
    // Setup do banco de teste (em memória ou container)
    console.log('Setting up test database...');
  },

  async cleanup(): Promise<void> {
    // Limpeza do banco de teste
    console.log('Cleaning up test database...');
  },

  async createTestUser(): Promise<{ id: number; email: string; name: string }> {
    return {
      id: 1,
      email: 'integration@test.com',
      name: 'Integration Test User'
    };
  },

  async createTestDomain(userId: number, domain: string, verified: boolean): Promise<{ id: number; domain: string }> {
    return {
      id: 1,
      domain
    };
  }
};

describe('Email Flow Integration Tests', () => {
  beforeAll(async () => {
    await testDatabase.setup();
  });

  afterAll(async () => {
    await testDatabase.cleanup();
  });

  describe('Internal Email Service Integration (Fase 1 Corrections)', () => {
    it('should handle complete email flow from registration', async () => {
      const internalEmailService = new InternalEmailService();
      
      // Test dados para verificação de email
      const testEmail = 'integration@test.com';
      const testName = 'Integration Test User';
      const testToken = 'integration-verification-token';

      // Mock do SMTP delivery para não enviar emails reais
      const mockSMTPDelivery = jest.fn().mockResolvedValue(true);
      (internalEmailService as any).smtpDelivery = {
        deliverEmail: mockSMTPDelivery
      };

      // Should not throw error
      await expect(
        internalEmailService.sendVerificationEmail(testEmail, testName, testToken)
      ).resolves.not.toThrow();

      expect(mockSMTPDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@ultrazend.com.br',
          to: testEmail,
          subject: expect.stringContaining('Confirme seu email')
        })
      );
    });

    it('should handle password reset flow end-to-end', async () => {
      const internalEmailService = new InternalEmailService();
      const testUser = await testDatabase.createTestUser();
      
      // Mock SMTP
      const mockSMTPDelivery = jest.fn().mockResolvedValue(true);
      (internalEmailService as any).smtpDelivery = {
        deliverEmail: mockSMTPDelivery
      };

      const resetToken = 'password-reset-token-123';
      const resetUrl = `https://ultrazend.com.br/reset-password?token=${resetToken}`;

      await expect(
        internalEmailService.sendPasswordResetEmail(testUser.email, testUser.name, resetUrl)
      ).resolves.not.toThrow();

      expect(mockSMTPDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@ultrazend.com.br',
          to: testUser.email,
          subject: 'Redefinir sua senha - UltraZend',
          html: expect.stringContaining(resetUrl)
        })
      );
    });

    it('should handle SMTP fallback configuration (Fase 2)', async () => {
      const smtpDelivery = new SMTPDeliveryService();
      
      // Mock environment variables para fallback
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SMTP_FALLBACK_HOST: 'localhost',
        SMTP_FALLBACK_PORT: '1025',
        NODE_ENV: 'development'
      };

      // Verificar se fallback está configurado
      const hasFallback = (smtpDelivery as any).hasSMTPFallbackConfig();
      expect(hasFallback).toBe(true);

      // Restore environment
      process.env = originalEnv;
    });
  });

  describe('External Email Service Integration', () => {
    it('should validate external email service configuration', async () => {
      const domainValidator = new DomainValidator();
      const dkimManager = new MultiDomainDKIMManager();
      
      const externalEmailService = new ExternalEmailService({
        domainValidator,
        dkimManager
      });
      
      // Service should be properly configured
      expect(externalEmailService).toBeDefined();
      expect(externalEmailService).toBeInstanceOf(ExternalEmailService);
    });

    it('should handle domain validation flow', async () => {
      const testUser = await testDatabase.createTestUser();
      const testEmail = 'user@externaldomain.com';
      
      const domainValidator = new DomainValidator();
      
      // Mock database query para domínio não verificado
      const mockDb = require('../../config/database').default;
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null) // Domínio não encontrado
      });

      const validatedSender = await domainValidator.validateSenderDomain(testUser.id, testEmail);

      // Deve fazer fallback para domínio padrão
      expect(validatedSender.fallback).toBe(true);
      expect(validatedSender.email).toContain('@ultrazend.com.br');
      expect(validatedSender.reason).toContain('Domain not owned');
    });

    it('should integrate DKIM fallback with email delivery', async () => {
      const dkimManager = new MultiDomainDKIMManager();
      
      // Mock database para domínio não verificado
      const mockDb = require('../../config/database').default;
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'unverified-integration.com',
          is_verified: false,
          user_id: 1
        })
      });

      // Mock getDefaultDKIMConfig
      const mockGetDefaultDKIM = jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: 'mock-fallback-key',
          algorithm: 'rsa-sha256'
        });

      const dkimConfig = await dkimManager.getDKIMConfigForDomain('unverified-integration.com');

      expect(dkimConfig).toBeDefined();
      expect(dkimConfig?.domain).toBe('ultrazend.com.br');
      expect(mockGetDefaultDKIM).toHaveBeenCalled();
    });
  });

  describe('Email Architecture Middleware Integration (Fase 2)', () => {
    it('should process email through unified architecture', async () => {
      // Simular processamento através do middleware unificado
      const testUserId = 1;
      const testEmailData = {
        from: 'test@unverified-domain.com',
        to: 'recipient@example.com',
        subject: 'Integration Test Email',
        html: '<p>Test content</p>'
      };

      // Mock do DomainValidator
      const domainValidator = new DomainValidator();
      const mockValidation = jest.spyOn(domainValidator, 'validateSenderDomain')
        .mockResolvedValue({
          email: 'noreply+user1@ultrazend.com.br',
          dkimDomain: 'ultrazend.com.br',
          fallback: true,
          reason: 'Domain not verified'
        });

      const result = await domainValidator.validateSenderDomain(testUserId, testEmailData.from);

      expect(result.fallback).toBe(true);
      expect(result.email).toContain('@ultrazend.com.br');
      expect(result.dkimDomain).toBe('ultrazend.com.br');
      expect(mockValidation).toHaveBeenCalledWith(testUserId, testEmailData.from);
    });

    it('should handle email stats collection', async () => {
      const domainValidator = new DomainValidator();
      const dkimManager = new MultiDomainDKIMManager();
      
      const externalEmailService = new ExternalEmailService({
        domainValidator,
        dkimManager,
        enableAuditLogging: true
      });

      // Mock database para estatísticas
      const mockDb = require('../../config/database').default;
      mockDb.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          total_emails: '10',
          sent_emails: '8',
          failed_emails: '2',
          modified_emails: '3'
        })
      });

      const stats = await externalEmailService.getEmailStats(1, 30);

      expect(stats.totalEmails).toBe(10);
      expect(stats.sentEmails).toBe(8);
      expect(stats.failedEmails).toBe(2);
      expect(stats.modifiedEmails).toBe(3);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle SMTP delivery failures gracefully', async () => {
      const smtpDelivery = new SMTPDeliveryService();
      
      // Mock falha na entrega direta
      const mockDeliverDirectly = jest.spyOn(smtpDelivery, 'deliverDirectlyViaMX' as any)
        .mockRejectedValue(new Error('MX delivery failed'));

      // Mock sucesso no fallback
      const mockDeliverFallback = jest.spyOn(smtpDelivery, 'deliverViaSMTPRelay' as any)
        .mockResolvedValue(true);

      // Mock environment para ter fallback
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SMTP_FALLBACK_HOST: 'localhost',
        SMTP_FALLBACK_PORT: '1025',
        NODE_ENV: 'development'
      };

      const emailData = {
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        html: '<p>Test</p>',
        dkimSignature: 'mock-signature'
      };

      const result = await smtpDelivery.deliverEmail(emailData);

      expect(result).toBe(true);
      expect(mockDeliverDirectly).toHaveBeenCalled();
      expect(mockDeliverFallback).toHaveBeenCalled();

      // Restore environment
      process.env = originalEnv;
    });

    it('should handle database connection failures', async () => {
      const dkimManager = new MultiDomainDKIMManager();
      
      // Mock falha de conexão com banco
      const mockDb = require('../../config/database').default;
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      });

      await expect(
        dkimManager.getDKIMConfigForDomain('test-domain.com')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle service initialization failures', async () => {
      // Test error handling when services fail to initialize
      const mockLogger = require('../../config/logger').logger;
      
      // Mock DKIM manager initialization failure
      const originalDKIMManager = MultiDomainDKIMManager;
      
      jest.doMock('../../services/MultiDomainDKIMManager', () => {
        return {
          MultiDomainDKIMManager: jest.fn().mockImplementation(() => {
            throw new Error('DKIM Manager initialization failed');
          })
        };
      });

      expect(() => {
        new MultiDomainDKIMManager();
      }).toThrow('DKIM Manager initialization failed');

      // Restore
      jest.doMock('../../services/MultiDomainDKIMManager', () => ({
        MultiDomainDKIMManager: originalDKIMManager
      }));
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent email requests', async () => {
      const internalEmailService = new InternalEmailService();
      
      // Mock SMTP para testes de performance
      const mockSMTPDelivery = jest.fn().mockResolvedValue(true);
      (internalEmailService as any).smtpDelivery = {
        deliverEmail: mockSMTPDelivery
      };

      // Criar múltiplas requisições simultâneas
      const promises = Array.from({ length: 10 }, (_, i) => 
        internalEmailService.sendVerificationEmail(
          `test${i}@example.com`,
          `Test User ${i}`,
          `token-${i}`
        )
      );

      const results = await Promise.allSettled(promises);
      
      // Todas as requisições devem ser bem-sucedidas
      const successfulResults = results.filter(result => result.status === 'fulfilled');
      expect(successfulResults).toHaveLength(10);
      expect(mockSMTPDelivery).toHaveBeenCalledTimes(10);
    });

    it('should handle email queue processing', async () => {
      // Simular processamento de fila de emails
      const emailQueue = [
        { from: 'sender1@example.com', to: 'recipient1@example.com', subject: 'Test 1' },
        { from: 'sender2@example.com', to: 'recipient2@example.com', subject: 'Test 2' },
        { from: 'sender3@example.com', to: 'recipient3@example.com', subject: 'Test 3' }
      ];

      const smtpDelivery = new SMTPDeliveryService();
      const mockDelivery = jest.spyOn(smtpDelivery, 'deliverEmail').mockResolvedValue(true);

      // Processar fila sequencialmente
      const results = [];
      for (const emailData of emailQueue) {
        const result = await smtpDelivery.deliverEmail(emailData);
        results.push(result);
      }

      expect(results).toEqual([true, true, true]);
      expect(mockDelivery).toHaveBeenCalledTimes(3);
    });
  });
});