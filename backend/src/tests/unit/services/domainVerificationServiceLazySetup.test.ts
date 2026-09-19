import { describe, expect, it, jest } from '@jest/globals';

const DomainSetupService = jest.fn();

jest.mock('../../../services/DomainSetupService', () => ({
  DomainSetupService
}));

import { DomainVerificationService } from '../../../services/DomainVerificationService';

describe('DomainVerificationService lazy setup dependency', () => {
  it('does not initialize DKIM/DNS setup for cache-only construction', () => {
    new DomainVerificationService();

    expect(DomainSetupService).not.toHaveBeenCalled();
  });
});
