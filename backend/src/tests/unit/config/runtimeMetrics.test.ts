import { getRuntimeMemoryMetrics } from '../../../config/runtimeMetrics';

describe('getRuntimeMemoryMetrics', () => {
  it('keeps heap accounting separate from RSS and native memory', () => {
    const metrics = getRuntimeMemoryMetrics({
      rss: 128 * 1024 * 1024,
      heapTotal: 64 * 1024 * 1024,
      heapUsed: 32 * 1024 * 1024,
      external: 48 * 1024 * 1024,
      arrayBuffers: 16 * 1024 * 1024
    });

    expect(metrics).toEqual({
      heapUsedMb: 32,
      heapTotalMb: 64,
      heapUsagePercent: 50,
      rssMb: 128,
      externalMb: 48,
      arrayBuffersMb: 16
    });
  });
});
