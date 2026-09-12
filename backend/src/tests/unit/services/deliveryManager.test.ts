import { getNextDeliveryAttempt } from '../../../utils/deliveryAttempts';

describe('getNextDeliveryAttempt', () => {
  it('increments the persisted attempt exactly once', () => {
    expect(getNextDeliveryAttempt(0)).toBe(1);
    expect(getNextDeliveryAttempt(2)).toBe(3);
  });

  it('normalizes missing or invalid persisted values', () => {
    expect(getNextDeliveryAttempt(undefined)).toBe(1);
    expect(getNextDeliveryAttempt(-1)).toBe(1);
  });
});
