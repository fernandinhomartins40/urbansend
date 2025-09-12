/**
 * Testes unitários para MultiDomainDKIMManager
 * Foca em testar as correções da Fase 1 - DKIM fallback para domínios não verificados
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MultiDomainDKIMManager } from '../../../services/MultiDomainDKIMManager';
import db from '../../../config/database';

// Mock do banco de dados
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('MultiDomainDKIMManager - DKIM Fallback (Fase 1 Corrections)', () => {
  let dkimManager: MultiDomainDKIMManager;
  let mockDb: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    dkimManager = new MultiDomainDKIMManager();
    
    // Mock do banco de dados
    mockDb = db as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('DKIM Configuration for Unverified Domains', () => {
    it('should use fallback DKIM for unverified domains', async () => {
      // Mock domain record não verificado
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'unverified.com',
          is_verified: false,
          user_id: 1
        })
      });

      // Mock para getDefaultDKIMConfig
      const mockGetDefaultDKIM = jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: 'mock-private-key',
          algorithm: 'rsa-sha256'
        });

      const config = await dkimManager.getDKIMConfigForDomain('unverified.com');

      expect(config).toBeDefined();
      expect(config?.domain).toBe('ultrazend.com.br'); // Fallback domain
      expect(mockGetDefaultDKIM).toHaveBeenCalled();
    });

    it('should generate DKIM for verified domains', async () => {
      // Mock domain record verificado
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'verified.com',
          is_verified: true,
          user_id: 1
        })
      });

      // Mock DKIM keys query (não existente, então deve gerar)
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      // Mock para generateDKIMKeys
      const mockGenerateDKIM = jest.spyOn(dkimManager, 'generateDKIMKeys' as any)
        .mockResolvedValue({
          privateKey: 'generated-private-key',
          publicKey: 'generated-public-key'
        });

      // Mock para database insert
      mockDb.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue([1])
      });

      const config = await dkimManager.getDKIMConfigForDomain('verified.com');

      expect(config).toBeDefined();
      expect(config?.domain).toBe('verified.com');
      expect(mockGenerateDKIM).toHaveBeenCalled();
    });

    it('should not block DKIM generation for unverified domains', async () => {
      // Verificar se a correção da Fase 1 removeu o bloqueio
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'newdomain.com',
          is_verified: false,
          user_id: 1
        })
      });

      const mockGetDefaultDKIM = jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: 'fallback-key',
          algorithm: 'rsa-sha256'
        });

      const config = await dkimManager.getDKIMConfigForDomain('newdomain.com');

      // Não deve retornar null (como antes da correção)
      expect(config).not.toBeNull();
      expect(config).toBeDefined();
      expect(mockGetDefaultDKIM).toHaveBeenCalled();
    });

    it('should log appropriate warnings for fallback usage', async () => {
      const mockLogger = require('../../../config/logger').logger;
      
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'unverified-with-warning.com',
          is_verified: false,
          user_id: 1
        })
      });

      jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: 'fallback-key'
        });

      await dkimManager.getDKIMConfigForDomain('unverified-with-warning.com');

      // Verificar se warning foi logado
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('DKIM requested for unverified domain'),
        expect.objectContaining({
          domain: 'unverified-with-warning.com',
          isVerified: false,
          fallbackDomain: expect.any(String)
        })
      );
    });

    it('should handle domain not found in database', async () => {
      // Mock domain que não existe
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const config = await dkimManager.getDKIMConfigForDomain('nonexistent.com');

      // Deve retornar null para domínios não cadastrados
      expect(config).toBeNull();
    });

    it('should preserve DKIM functionality for verified domains', async () => {
      // Verificar se domínios verificados ainda funcionam normalmente
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'verified-domain.com',
          is_verified: true,
          user_id: 1,
          verified_at: new Date()
        })
      });

      // Mock DKIM existente
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_id: 1,
          selector: 'default',
          private_key: 'existing-private-key',
          public_key: 'existing-public-key',
          is_active: true
        })
      });

      const config = await dkimManager.getDKIMConfigForDomain('verified-domain.com');

      expect(config).toBeDefined();
      expect(config?.domain).toBe('verified-domain.com');
      expect(config?.privateKey).toBe('existing-private-key');
      expect(config?.selector).toBe('default');
    });
  });

  describe('Fallback Configuration', () => {
    it('should provide consistent fallback configuration', async () => {
      const mockGetDefaultDKIM = jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: 'consistent-fallback-key',
          algorithm: 'rsa-sha256'
        });

      // Testar múltiplas chamadas para domínios diferentes não verificados
      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          is_verified: false,
          user_id: 1
        })
      });

      const config1 = await dkimManager.getDKIMConfigForDomain('domain1.com');
      const config2 = await dkimManager.getDKIMConfigForDomain('domain2.com');

      expect(config1?.domain).toBe('ultrazend.com.br');
      expect(config2?.domain).toBe('ultrazend.com.br');
      expect(config1?.privateKey).toBe(config2?.privateKey);
      expect(mockGetDefaultDKIM).toHaveBeenCalledTimes(2);
    });

    it('should handle fallback configuration errors gracefully', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'error-domain.com',
          is_verified: false,
          user_id: 1
        })
      });

      // Mock fallback que falha
      jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockRejectedValue(new Error('Fallback configuration failed'));

      await expect(
        dkimManager.getDKIMConfigForDomain('error-domain.com')
      ).rejects.toThrow('Fallback configuration failed');
    });
  });

  describe('Integration with Email Delivery', () => {
    it('should provide DKIM configuration that works with email signing', async () => {
      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({
          id: 1,
          domain_name: 'integration-test.com',
          is_verified: false,
          user_id: 1
        })
      });

      jest.spyOn(dkimManager, 'getDefaultDKIMConfig' as any)
        .mockResolvedValue({
          domain: 'ultrazend.com.br',
          selector: 'default',
          privateKey: '-----BEGIN PRIVATE KEY-----\nMOCK_PRIVATE_KEY\n-----END PRIVATE KEY-----',
          algorithm: 'rsa-sha256'
        });

      const config = await dkimManager.getDKIMConfigForDomain('integration-test.com');

      expect(config).toBeDefined();
      expect(config?.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(config?.algorithm).toBe('rsa-sha256');
      expect(config?.selector).toBe('default');
    });
  });
});