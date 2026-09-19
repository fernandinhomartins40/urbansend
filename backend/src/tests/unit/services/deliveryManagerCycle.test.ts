const mockLoggerError = jest.fn();
const mockDatabase = jest.fn();

jest.mock('../../../config/logger', () => ({
  logger: { debug: jest.fn(), error: mockLoggerError, info: jest.fn(), warn: jest.fn() }
}));

jest.mock('../../../config/database', () => ({ __esModule: true, default: mockDatabase }));

import { DeliveryManager } from '../../../services/deliveryManager';

describe('DeliveryManager tenant-aware polling', () => {
  it('does not overlap a still-running delivery cycle', async () => {
    let releaseFirstCycle!: () => void;
    const firstCycle = new Promise<void>((resolve) => { releaseFirstCycle = resolve; });
    const manager = Object.create(DeliveryManager.prototype) as any;

    manager.isPollingDeliveryQueue = false;
    manager.activeDeliveries = 0;
    manager.config = { maxConcurrentDeliveries: 10 };
    manager.recoverStaleDeliveries = jest.fn(() => firstCycle);
    manager.discoverTenantsWithPendingDeliveries = jest.fn().mockResolvedValue([42]);
    manager.processTenantDeliveries = jest.fn().mockResolvedValue(undefined);

    const running = manager.runTenantAwareDeliveryCycle();
    await Promise.resolve();
    await manager.runTenantAwareDeliveryCycle();

    expect(manager.recoverStaleDeliveries).toHaveBeenCalledTimes(1);
    expect(manager.discoverTenantsWithPendingDeliveries).not.toHaveBeenCalled();

    releaseFirstCycle();
    await running;

    expect(manager.discoverTenantsWithPendingDeliveries).toHaveBeenCalledTimes(1);
    expect(manager.processTenantDeliveries).toHaveBeenCalledWith(42);
    expect(manager.isPollingDeliveryQueue).toBe(false);
  });

  it('accepts PostgreSQL JSON objects and legacy serialized delivery headers', () => {
    const manager = Object.create(DeliveryManager.prototype) as any;

    expect(manager.parseDeliveryHeaders({ 'x-test': 'postgres' })).toEqual({ 'x-test': 'postgres' });
    expect(manager.parseDeliveryHeaders('{"x-test":"sqlite"}')).toEqual({ 'x-test': 'sqlite' });
    expect(() => manager.parseDeliveryHeaders('[]')).toThrow('Delivery headers must be a JSON object');
  });

  it('logs a useful error message when a delivery cannot be claimed', async () => {
    mockDatabase.mockImplementationOnce(() => {
      throw new Error('delivery claim unavailable');
    });
    const manager = Object.create(DeliveryManager.prototype) as any;

    const result = await manager.processDelivery(77);

    expect(result).toEqual({ success: false, errorMessage: 'delivery claim unavailable' });
    expect(mockLoggerError).toHaveBeenCalledWith('Error processing delivery', {
      error: 'delivery claim unavailable',
      deliveryId: 77
    });
  });
});
