import knex from 'knex';
import { afterAll, describe, expect, it } from '@jest/globals';
import { analyticsEmailColumns, buildFilteredEmailQuery } from '../../../routes/analyticsQueryBuilders';

const database = knex({ client: 'pg' });

const normalizeSql = (sql: string) => sql
  .replace(/["`\[\]]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

describe('analyticsQueryBuilders', () => {
  afterAll(async () => {
    await database.destroy();
  });

  it('builds email queries with fully-qualified columns for joined analytics queries', () => {
    const query = buildFilteredEmailQuery(
      database,
      5,
      new Date('2026-03-01T00:00:00.000Z'),
      new Date('2026-03-04T00:00:00.000Z'),
      'revendeo.com.br'
    )
      .clone()
      .leftJoin('email_analytics', 'email_analytics.email_id', '=', 'emails.id')
      .countDistinct(
        database.raw(`
          CASE
            WHEN emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        `)
      );

    const normalizedSql = normalizeSql(query.toSQL().sql);

    expect(normalizedSql).toContain(analyticsEmailColumns.userId);
    expect(normalizedSql).toContain(analyticsEmailColumns.createdAt);
    expect(normalizedSql).toContain(analyticsEmailColumns.fromEmail);
    expect(normalizedSql).not.toContain(' where user_id =');
    expect(normalizedSql).not.toContain(' and created_at >=');
  });
});
