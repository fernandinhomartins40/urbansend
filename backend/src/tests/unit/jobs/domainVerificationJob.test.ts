import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const first = jest.fn();
const select = jest.fn();
const raw = jest.fn((sql: string) => sql);
const db = Object.assign(jest.fn(() => ({ select })), { raw });

jest.mock('../../../config/database', () => ({
  __esModule: true,
  default: db
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  Logger: { business: jest.fn(), error: jest.fn(), security: jest.fn() }
}));

import { domainVerificationJob } from '../../../jobs/domainVerificationJob';

describe('DomainVerificationJob statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    select.mockReturnValue({ first });
    first.mockResolvedValue({ total: '12', verified: '8', pending: '4' } as never);
  });

  it('aggregates domain totals in one database query', async () => {
    const stats = await domainVerificationJob.getJobStats();

    expect(db).toHaveBeenCalledTimes(1);
    expect(db).toHaveBeenCalledWith('domains');
    expect(select).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    expect(raw).toHaveBeenCalledTimes(3);
    expect(stats.domains).toEqual({ total: '12', verified: '8', pending: '4' });
  });
});
