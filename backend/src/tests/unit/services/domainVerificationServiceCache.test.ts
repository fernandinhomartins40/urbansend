import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DomainVerificationService } from '../../../services/DomainVerificationService';

describe('DomainVerificationService cache bounds', () => {
  const service = Object.create(DomainVerificationService.prototype) as any;
  const cache = (DomainVerificationService as any).cache as Map<string, any>;

  beforeEach(() => {
    cache.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cache.clear();
  });

  it('removes expired entries before adding a new verification result', () => {
    cache.set('expired', { result: {}, timestamp: 0 });

    service.setCachedResult('1:example.invalid', {});

    expect(cache.has('expired')).toBe(false);
    expect(cache.has('1:example.invalid')).toBe(true);
  });

  it('evicts the oldest entry when the cache reaches its configured ceiling', () => {
    for (let index = 0; index < 1000; index += 1) {
      cache.set(`key-${index}`, { result: {}, timestamp: Date.now() });
    }

    service.setCachedResult('new-key', {});

    expect(cache.size).toBe(1000);
    expect(cache.has('key-0')).toBe(false);
    expect(cache.has('new-key')).toBe(true);
  });
});
