import { shouldRouteLogToCategory } from '../../../config/logRouting';

describe('shouldRouteLogToCategory', () => {
  it('routes only events carrying the matching structured category', () => {
    expect(shouldRouteLogToCategory({ message: 'ordinary event' }, 'security')).toBe(false);
    expect(shouldRouteLogToCategory({ security: { action: 'login' } }, 'security')).toBe(true);
    expect(shouldRouteLogToCategory({ business: { action: 'created' } }, 'security')).toBe(false);
    expect(shouldRouteLogToCategory({ performance: {} }, 'performance')).toBe(true);
  });
});
