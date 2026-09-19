export interface RuntimeMemoryMetrics {
  heapUsedMb: number;
  heapTotalMb: number;
  heapUsagePercent: number;
  rssMb: number;
  externalMb: number;
  arrayBuffersMb: number;
}

const toMegabytes = (bytes: number): number => Math.round(bytes / 1024 / 1024);

/**
 * Heap and RSS are different budgets. Report both instead of presenting
 * heapTotal + external as a process-memory limit.
 */
export const getRuntimeMemoryMetrics = (
  memoryUsage: NodeJS.MemoryUsage = process.memoryUsage()
): RuntimeMemoryMetrics => {
  const heapUsagePercent = memoryUsage.heapTotal > 0
    ? Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
    : 0;

  return {
    heapUsedMb: toMegabytes(memoryUsage.heapUsed),
    heapTotalMb: toMegabytes(memoryUsage.heapTotal),
    heapUsagePercent,
    rssMb: toMegabytes(memoryUsage.rss),
    externalMb: toMegabytes(memoryUsage.external),
    arrayBuffersMb: toMegabytes(memoryUsage.arrayBuffers)
  };
};
