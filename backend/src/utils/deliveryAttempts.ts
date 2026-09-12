export function getNextDeliveryAttempt(currentAttempts: unknown): number {
  const normalized = Number(currentAttempts || 0);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized + 1 : 1;
}
