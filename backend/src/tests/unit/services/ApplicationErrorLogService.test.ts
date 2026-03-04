import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import db from '../../../config/database';
import { ApplicationErrorLogService } from '../../../services/ApplicationErrorLogService';

jest.mock('../../../config/database');

describe('ApplicationErrorLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables persistence after detecting a missing application_error_logs table', async () => {
    const mockDb = db as unknown as jest.Mock;
    const insert = jest.fn(() => Promise.reject({
      code: '42P01',
      message: 'relation "application_error_logs" does not exist'
    }));
    mockDb.mockReturnValue({ insert });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new ApplicationErrorLogService();

    await service.captureBackendError({ error: new Error('first failure') });
    await service.captureBackendError({ error: new Error('second failure') });

    expect(mockDb).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
