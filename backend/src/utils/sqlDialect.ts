import db from '../config/database';

const isPostgres = (): boolean => {
  const client = (db as any).client?.config?.client;
  return client === 'pg' || client === 'postgresql';
};

/**
 * Extract domain from an email column.
 * SQLite:     SUBSTR(col, INSTR(col, '@') + 1)
 * PostgreSQL: SPLIT_PART(col, '@', 2)
 */
export const sqlExtractDomain = (col: string): string =>
  isPostgres()
    ? `SPLIT_PART(${col}, '@', 2)`
    : `SUBSTR(${col}, INSTR(${col}, '@') + 1)`;

/**
 * Extract hour from a timestamp column.
 * SQLite:     CAST(strftime('%H', col) AS INTEGER)
 * PostgreSQL: EXTRACT(HOUR FROM col)
 */
export const sqlExtractHour = (col: string): string =>
  isPostgres()
    ? `EXTRACT(HOUR FROM ${col})::INTEGER`
    : `CAST(strftime('%H', ${col}) AS INTEGER)`;

/**
 * Extract day of week (0 = Sunday).
 * SQLite:     CAST(strftime('%w', col) AS INTEGER)
 * PostgreSQL: EXTRACT(DOW FROM col)
 */
export const sqlExtractDow = (col: string): string =>
  isPostgres()
    ? `EXTRACT(DOW FROM ${col})::INTEGER`
    : `CAST(strftime('%w', ${col}) AS INTEGER)`;

/**
 * Group dates by a period.
 * @param col           – column reference
 * @param sqliteFormat  – strftime format, e.g. '%Y-%m-%d'
 * @param pgFormat      – TO_CHAR format, e.g. 'YYYY-MM-DD'
 */
export const sqlDateFormat = (col: string, sqliteFormat: string, pgFormat: string): string =>
  isPostgres()
    ? `TO_CHAR(${col}, '${pgFormat}')`
    : `strftime('${sqliteFormat}', ${col})`;

/**
 * Get a date N days in the past.
 * SQLite:     date('now', '-N days')
 * PostgreSQL: NOW() - INTERVAL 'N days'
 */
export const sqlDaysAgo = (days: number): string =>
  isPostgres()
    ? `NOW() - INTERVAL '${days} days'`
    : `date('now', '-${days} days')`;

/**
 * Extract a text value from a JSON/JSONB column.
 * SQLite:     JSON_EXTRACT(col, '$.key')
 * PostgreSQL: col->>'key'
 */
export const sqlJsonExtract = (col: string, key: string): string =>
  isPostgres()
    ? `${col}->>'${key}'`
    : `JSON_EXTRACT(${col}, '$.${key}')`;

/**
 * Check if a JSON array column contains a value (text search).
 * SQLite:     JSON_EXTRACT(col, '$') LIKE '%"value"%'
 * PostgreSQL: col::TEXT LIKE '%"value"%'
 */
export const sqlJsonContainsLike = (col: string): string =>
  isPostgres()
    ? `${col}::TEXT LIKE ?`
    : `JSON_EXTRACT(${col}, '$') LIKE ?`;
