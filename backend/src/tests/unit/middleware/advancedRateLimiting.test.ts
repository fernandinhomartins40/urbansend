import { getUserTier, rateLimiterInstance } from '../../../middleware/advancedRateLimiting';

describe('advanced rate limiting', () => {
  afterAll(() => rateLimiterInstance.destroy());

  it('does not grant a higher tier from a low user id', () => {
    expect(getUserTier(1)).toBe('free');
    expect(getUserTier(99)).toBe('free');
  });
});
