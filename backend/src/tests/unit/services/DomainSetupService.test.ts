import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../../config/database';
import { generateVerificationToken } from '../../../utils/crypto';
import { DomainSetupService } from '../../../services/DomainSetupService';

jest.mock('../../../config/database');
jest.mock('../../../config/logger');
jest.mock('../../../utils/crypto', () => ({
  generateVerificationToken: jest.fn()
}));
jest.mock('../../../services/MultiDomainDKIMManager', () => ({
  MultiDomainDKIMManager: jest.fn().mockImplementation(() => ({
    regenerateDKIMKeysForDomain: jest.fn()
  }))
}));

describe('DomainSetupService', () => {
  const createDnsInstructions = () => ({
    a_records: {
      smtp: {
        record: 'smtp',
        value: '31.97.162.155',
        priority: 10,
        description: 'SMTP host'
      },
      mail: {
        record: 'mail',
        value: '31.97.162.155',
        priority: 10,
        description: 'Mail host'
      }
    },
    mx: {
      record: '@',
      value: 'mail.example.com',
      priority: 10,
      description: 'MX record'
    },
    spf: {
      record: '@',
      value: 'v=spf1 include:ultrazend.com.br ~all',
      priority: 10,
      description: 'SPF record'
    },
    dkim: {
      record: 'default._domainkey',
      value: 'v=DKIM1; k=rsa; p=public-key',
      priority: 10,
      description: 'DKIM record'
    },
    dmarc: {
      record: '_dmarc',
      value: 'v=DMARC1; p=quarantine;',
      priority: 10,
      description: 'DMARC record'
    }
  });

  const configureDbMocks = (options: {
    insertResult: unknown;
    reloadedId: number;
  }) => {
    const mockDb = db as unknown as jest.Mock;
    const reloadedDomain = {
      id: options.reloadedId,
      user_id: 1,
      domain_name: 'example.com',
      verification_token: 'token-123',
      verification_method: 'dns',
      is_verified: false,
      dkim_enabled: true,
      dkim_selector: 'default',
      spf_enabled: true,
      dmarc_enabled: true,
      dmarc_policy: 'quarantine',
      created_at: new Date('2026-03-03T12:00:00.000Z'),
      updated_at: new Date('2026-03-03T12:00:00.000Z')
    };

    const dkimQuery: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn(() => Promise.resolve({
        private_key: 'private-key',
        public_key: 'public-key'
      }))
    };

    let domainTableCalls = 0;
    const insertBuilder: any = {
      insert: jest.fn(() => Promise.resolve(options.insertResult))
    };
    const reloadBuilder: any = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(() => Promise.resolve(reloadedDomain))
    };

    const trx = jest.fn((table: string) => {
      if (table !== 'domains') {
        throw new Error(`Unexpected transaction table: ${table}`);
      }

      domainTableCalls += 1;
      return domainTableCalls === 1 ? insertBuilder : reloadBuilder;
    });

    mockDb.mockImplementation((table: string) => {
      if (table === 'dkim_keys') {
        return dkimQuery;
      }

      throw new Error(`Unexpected table outside transaction: ${table}`);
    });

    (mockDb as any).transaction = jest.fn(async (handler: (trx: any) => Promise<void>) => handler(trx));

    return { mockDb, insertBuilder, reloadBuilder };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (generateVerificationToken as jest.Mock).mockReturnValue('token-123');
  });

  it('reloads the domain after insert without depending on the insert return payload', async () => {
    const service = new DomainSetupService();
    const regenerateDKIMKeysForDomain = jest.fn(() => Promise.resolve(true));
    (service as any).dkimManager.regenerateDKIMKeysForDomain = regenerateDKIMKeysForDomain;

    jest.spyOn(service as any, 'checkExistingDomain').mockResolvedValue(null);
    jest.spyOn(service as any, 'createDNSInstructions').mockReturnValue(createDnsInstructions());
    jest.spyOn(service as any, 'generateSetupGuide').mockReturnValue(['step 1']);

    const { mockDb, insertBuilder, reloadBuilder } = configureDbMocks({
      insertResult: undefined,
      reloadedId: 17
    });

    const result = await service.initiateDomainSetup(1, 'example.com');

    expect(result.domain.id).toBe(17);
    expect(insertBuilder.insert).toHaveBeenCalledTimes(1);
    expect(reloadBuilder.orderBy).toHaveBeenCalledWith('id', 'desc');
    expect((mockDb as any).transaction).toHaveBeenCalledTimes(1);
    expect(regenerateDKIMKeysForDomain).toHaveBeenCalledWith('example.com');
  });

  it('accepts postgres-style insert payloads without calling returning', async () => {
    const service = new DomainSetupService();
    const regenerateDKIMKeysForDomain = jest.fn(() => Promise.resolve(true));
    (service as any).dkimManager.regenerateDKIMKeysForDomain = regenerateDKIMKeysForDomain;

    jest.spyOn(service as any, 'checkExistingDomain').mockResolvedValue(null);
    jest.spyOn(service as any, 'createDNSInstructions').mockReturnValue(createDnsInstructions());
    jest.spyOn(service as any, 'generateSetupGuide').mockReturnValue(['step 1']);

    const { insertBuilder } = configureDbMocks({
      insertResult: [{ id: '23' }],
      reloadedId: 23
    });

    const result = await service.initiateDomainSetup(1, 'example.com');

    expect(result.domain.id).toBe(23);
    expect(insertBuilder.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects domains already linked to a different account before opening the transaction', async () => {
    const service = new DomainSetupService();
    const transactionSpy = jest.spyOn(db as any, 'transaction');

    jest.spyOn(service as any, 'checkExistingDomain').mockResolvedValue({
      id: 44,
      user_id: 99,
      domain_name: 'example.com'
    });

    await expect(service.initiateDomainSetup(1, 'example.com')).rejects.toThrow(
      'already linked to another account'
    );
    expect(transactionSpy).not.toHaveBeenCalled();
  });
});
