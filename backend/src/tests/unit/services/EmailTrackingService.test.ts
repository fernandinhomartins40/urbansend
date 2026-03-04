import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../../config/database';
import { EmailTrackingService, resolveTrackingClientIp } from '../../../services/EmailTrackingService';

jest.mock('../../../config/database');
jest.mock('../../../services/EmailWebhookEventService', () => ({
  emailWebhookEventService: {
    emitForEmail: jest.fn(),
    emitByMessageId: jest.fn()
  }
}));
jest.mock('../../../config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn()
  }
}));

const createQueryBuilder = (options: {
  firstValue?: any;
  updateValue?: any;
  insertValue?: any;
} = {}) => {
  const builder: any = {
    select: jest.fn(() => builder),
    where: jest.fn(() => builder),
    whereIn: jest.fn(() => builder),
    whereNull: jest.fn(() => builder),
    first: jest.fn(async () => options.firstValue),
    update: jest.fn(async () => options.updateValue ?? 1),
    insert: jest.fn(async () => options.insertValue ?? [1])
  };

  return builder;
};

const createTableDispatcher = (tableBuilders: Record<string, any[]>) => {
  const counts = new Map<string, number>();

  return jest.fn((table: string) => {
    const builders = tableBuilders[table];
    if (!builders || builders.length === 0) {
      throw new Error(`Unexpected table access: ${table}`);
    }

    const currentIndex = counts.get(table) || 0;
    counts.set(table, currentIndex + 1);

    return builders[Math.min(currentIndex, builders.length - 1)];
  });
};

describe('EmailTrackingService', () => {
  const service = new EmailTrackingService();
  const mockDb = db as unknown as jest.Mock & { transaction: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.mockReset();
    mockDb.transaction = jest.fn();
  });

  it('records the first open event without relying on opened_at', async () => {
    const emailLookup = createQueryBuilder({
      firstValue: {
        id: 42,
        user_id: 7,
        to_email: 'destinatario@example.com',
        status: 'delivered'
      }
    });
    const existingOpenLookup = createQueryBuilder({ firstValue: undefined });
    const emailUpdate = createQueryBuilder();
    const eventInsert = createQueryBuilder();

    mockDb.mockImplementation(createTableDispatcher({
      emails: [emailLookup]
    }));
    mockDb.transaction.mockImplementation(async (callback: (trx: any) => Promise<void>) => {
      const trx = createTableDispatcher({
        email_analytics: [existingOpenLookup, eventInsert],
        emails: [emailUpdate]
      });
      return callback(trx);
    });

    const tracked = await service.trackOpenByTrackingId('track-open-1', {
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0'
    });

    expect(tracked).toBe(true);
    expect(emailUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'opened'
    }));
    expect(eventInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'open',
      tracking_id: 'track-open-1',
      ip_address: '203.0.113.10',
      recipient_email: 'destinatario@example.com'
    }));
  });

  it('does not duplicate an open event from the same IP', async () => {
    const emailLookup = createQueryBuilder({
      firstValue: {
        id: 42,
        user_id: 7,
        to_email: 'destinatario@example.com',
        status: 'opened'
      }
    });
    const existingOpenLookup = createQueryBuilder({ firstValue: { id: 99 } });

    mockDb.mockImplementation(createTableDispatcher({
      emails: [emailLookup]
    }));
    mockDb.transaction.mockImplementation(async (callback: (trx: any) => Promise<void>) => {
      const trx = createTableDispatcher({
        email_analytics: [existingOpenLookup]
      });
      return callback(trx);
    });

    const tracked = await service.trackOpenByTrackingId('track-open-1', {
      ipAddress: '203.0.113.10'
    });

    expect(tracked).toBe(true);
    expect(existingOpenLookup.first).toHaveBeenCalledTimes(1);
  });

  it('records click events and upgrades the email status to clicked', async () => {
    const emailLookup = createQueryBuilder({
      firstValue: {
        id: 55,
        user_id: 9,
        to_email: 'click@example.com',
        status: 'opened'
      }
    });
    const existingOpenLookup = createQueryBuilder({ firstValue: undefined });
    const existingClickLookup = createQueryBuilder({ firstValue: undefined });
    const emailUpdate = createQueryBuilder();
    const inferredOpenInsert = createQueryBuilder();
    const clickInsert = createQueryBuilder();

    mockDb.mockImplementation(createTableDispatcher({
      emails: [emailLookup]
    }));
    mockDb.transaction.mockImplementation(async (callback: (trx: any) => Promise<void>) => {
      const trx = createTableDispatcher({
        email_analytics: [existingOpenLookup, existingClickLookup, inferredOpenInsert, clickInsert],
        emails: [emailUpdate]
      });
      return callback(trx);
    });

    const tracked = await service.trackClickByTrackingId(
      'track-click-1',
      'https://example.com/oferta',
      {
        ipAddress: '198.51.100.5',
        userAgent: 'Mozilla/5.0'
      }
    );

    expect(tracked).toBe(true);
    expect(existingClickLookup.where).toHaveBeenCalledWith('link_url', 'https://example.com/oferta');
    expect(emailUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'clicked'
    }));
    expect(inferredOpenInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'open',
      tracking_id: 'track-click-1',
      ip_address: '198.51.100.5'
    }));
    expect(clickInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'click',
      link_url: 'https://example.com/oferta',
      tracking_id: 'track-click-1'
    }));
  });

  it('records SMTP acceptance as a delivered analytics event once per message', async () => {
    const emailLookup = createQueryBuilder({
      firstValue: { id: 77 }
    });
    const existingDeliveredLookup = createQueryBuilder({ firstValue: undefined });
    const deliveredInsert = createQueryBuilder();

    mockDb.mockImplementation(createTableDispatcher({
      emails: [emailLookup],
      email_analytics: [existingDeliveredLookup, deliveredInsert]
    }));

    await service.recordDeliveredEventForMessage(
      'msg-1',
      'track-1',
      'destinatario@example.com',
      5
    );

    expect(deliveredInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 5,
      email_id: 77,
      event_type: 'delivered',
      tracking_id: 'track-1',
      recipient_email: 'destinatario@example.com'
    }));
  });

  it('extracts the real client IP from forwarded headers', () => {
    const ip = resolveTrackingClientIp({
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1'
      },
      ip: '10.0.0.1'
    });

    expect(ip).toBe('203.0.113.10');
  });
});
