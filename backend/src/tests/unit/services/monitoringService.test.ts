import { afterEach, describe, expect, it } from '@jest/globals';
import { MonitoringService } from '../../../services/monitoringService';

describe('MonitoringService Redis gating', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  it('does not consider Redis configured from implicit localhost defaults', () => {
    delete process.env.REDIS_URL;
    const service = new MonitoringService({} as any);

    expect((service as any).isRedisConfigured()).toBe(false);
  });

  it('enables Redis health checks only when an explicit URL is configured', () => {
    process.env.REDIS_URL = 'redis://cache.example.invalid:6379';
    const service = new MonitoringService({} as any);

    expect((service as any).isRedisConfigured()).toBe(true);
  });

  it('does not overlap slow periodic health-check cycles', async () => {
    delete process.env.REDIS_URL;
    const service = new MonitoringService({} as any);
    let releaseDatabaseCheck: (() => void) | undefined;
    const pendingDatabaseCheck = new Promise<void>((resolve) => {
      releaseDatabaseCheck = resolve;
    });

    const smtpCheck = jest.fn().mockResolvedValue(undefined);
    const databaseCheck = jest.fn().mockReturnValue(pendingDatabaseCheck);
    const systemCheck = jest.fn().mockResolvedValue(undefined);

    (service as any).checkSMTPHealth = smtpCheck;
    (service as any).checkDatabaseHealth = databaseCheck;
    (service as any).checkSystemHealth = systemCheck;

    const firstCycle = (service as any).performAllHealthChecks();
    await Promise.resolve();
    await (service as any).performAllHealthChecks();

    expect(smtpCheck).toHaveBeenCalledTimes(1);
    expect(databaseCheck).toHaveBeenCalledTimes(1);
    expect(systemCheck).toHaveBeenCalledTimes(1);

    releaseDatabaseCheck?.();
    await firstCycle;
    await (service as any).performAllHealthChecks();

    expect(smtpCheck).toHaveBeenCalledTimes(2);
    expect(databaseCheck).toHaveBeenCalledTimes(2);
    expect(systemCheck).toHaveBeenCalledTimes(2);
  });
});
