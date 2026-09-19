import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const schedule = jest.fn();
const stop = jest.fn();
const runRecurringVerification = jest.fn();
const cleanupOldLogs = jest.fn();
const cleanupOldJobs = jest.fn();

jest.mock('node-cron', () => ({
  schedule
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  Logger: { business: jest.fn(), error: jest.fn(), security: jest.fn() }
}));

jest.mock('../../../utils/env', () => ({
  Env: {
    get: jest.fn(() => 'test'),
    getBoolean: jest.fn((key: string, fallback: boolean) => {
      if (key === 'DOMAIN_INITIAL_VERIFICATION_ENABLED') return false;
      return fallback;
    }),
    getNumber: jest.fn((_key: string, fallback: number) => fallback)
  }
}));

jest.mock('../../../jobs/domainVerificationJob', () => ({
  domainVerificationJob: {
    runRecurringVerification,
    cleanupOldJobs,
    getJobStats: jest.fn()
  }
}));

jest.mock('../../../services/DomainVerificationLogger', () => ({
  domainVerificationLogger: {
    cleanupOldLogs,
    checkForRecurringIssues: jest.fn(),
    getVerificationStats: jest.fn()
  }
}));

import { DomainVerificationInitializer } from '../../../services/domainVerificationInitializer';

describe('DomainVerificationInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    schedule.mockReturnValue({ stop });
    runRecurringVerification.mockResolvedValue(undefined as never);
  });

  it('does not delete logs at boot and schedules recurring work with stoppable handles', async () => {
    const initializer = new DomainVerificationInitializer();

    await initializer.initialize();

    expect(cleanupOldLogs).not.toHaveBeenCalled();
    expect(cleanupOldJobs).not.toHaveBeenCalled();
    expect(runRecurringVerification).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function));
    expect(schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));

    const cleanupCallback = schedule.mock.calls.find(([expression]) => expression === '0 2 * * *')?.[1] as (() => Promise<void>) | undefined;
    await cleanupCallback?.();

    expect(cleanupOldLogs).toHaveBeenCalledWith(90);
    expect(cleanupOldJobs).not.toHaveBeenCalled();

    initializer.stop();

    expect(stop).toHaveBeenCalledTimes(2);
  });
});
