import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../../config/database';
import { Logger } from '../../../config/logger';
import { DomainVerificationLogger } from '../../../services/DomainVerificationLogger';

jest.mock('../../../config/database');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  Logger: {
    business: jest.fn(),
    error: jest.fn()
  }
}));

describe('DomainVerificationLogger', () => {
  const configureDbMocks = (options: {
    insertResult: unknown;
    reloadedId?: number;
  }) => {
    const mockDb = db as unknown as jest.Mock;
    const insertBuilder: any = {
      insert: jest.fn(() => Promise.resolve(options.insertResult))
    };
    const reloadBuilder: any = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(() => Promise.resolve(
        options.reloadedId === undefined ? null : { id: options.reloadedId }
      ))
    };

    let tableCalls = 0;
    mockDb.mockImplementation((table: string) => {
      if (table !== 'domain_verification_logs') {
        throw new Error(`Unexpected table: ${table}`);
      }

      tableCalls += 1;
      return tableCalls === 1 ? insertBuilder : reloadBuilder;
    });

    return { mockDb, insertBuilder, reloadBuilder };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reloads the inserted log when the insert payload is not directly usable', async () => {
    const verificationLogger = new DomainVerificationLogger();
    const { reloadBuilder } = configureDbMocks({
      insertResult: undefined,
      reloadedId: 41
    });

    const logId = await verificationLogger.logVerificationStart(7, 'example.com', {
      userId: 12,
      isAutomatedVerification: true,
      jobId: 'job-123',
      retryCount: 2
    });

    expect(logId).toBe(41);
    expect(reloadBuilder.orderBy).toHaveBeenCalledWith('id', 'desc');
    expect(reloadBuilder.where).toHaveBeenCalledWith('job_id', 'job-123');
    expect(Logger.business).toHaveBeenCalledWith(
      'domain_verification',
      'verification_started',
      expect.objectContaining({
        entityId: '7',
        userId: '12',
        metadata: expect.objectContaining({
          domainName: 'example.com',
          logId: 41
        })
      })
    );
  });

  it('accepts postgres-style insert payloads without reloading the row', async () => {
    const verificationLogger = new DomainVerificationLogger();
    const { reloadBuilder } = configureDbMocks({
      insertResult: [{ id: '58' }]
    });

    const logId = await verificationLogger.logVerificationStart(9, 'example.com', {
      userId: 5
    });

    expect(logId).toBe(58);
    expect(reloadBuilder.first).not.toHaveBeenCalled();
  });

  it('accepts insert payloads that expose insertId directly', async () => {
    const verificationLogger = new DomainVerificationLogger();
    const { reloadBuilder } = configureDbMocks({
      insertResult: { insertId: '73' }
    });

    const logId = await verificationLogger.logVerificationStart(11, 'example.com');

    expect(logId).toBe(73);
    expect(reloadBuilder.first).not.toHaveBeenCalled();
  });
});
