export type LogCategory = 'security' | 'performance' | 'business';

/**
 * Determines whether a structured log event belongs in a specialized channel.
 * The general application log remains the complete operational record.
 */
export const shouldRouteLogToCategory = (
  info: Readonly<Record<string, unknown>>,
  category: LogCategory
): boolean => info[category] !== undefined && info[category] !== null;
