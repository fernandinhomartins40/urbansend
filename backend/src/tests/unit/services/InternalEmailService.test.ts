import { describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../config/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

import { InternalEmailService } from '../../../services/InternalEmailService';

describe('InternalEmailService', () => {
  it('sends a verification message through the active internal delivery contract', async () => {
    const service = new InternalEmailService({ defaultFrom: 'noreply@test.invalid' });
    const deliverEmail = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
    (service as any).smtpDelivery = { deliverEmail };

    await service.sendVerificationEmail('recipient@test.invalid', 'Test User', 'verification-token');

    expect(deliverEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'noreply@test.invalid',
      to: 'recipient@test.invalid',
      subject: 'Verifique seu email - UltraZend',
      headers: expect.objectContaining({
        'X-Email-Type': 'verification',
        'X-UltraZend-Service': 'internal'
      })
    }));
  });

  it('propagates a failed internal delivery instead of reporting a false success', async () => {
    const service = new InternalEmailService();
    (service as any).smtpDelivery = {
      deliverEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(false)
    };

    await expect(
      service.sendVerificationEmail('recipient@test.invalid', 'Test User', 'verification-token')
    ).rejects.toThrow('SMTP delivery failed');
  });
});
