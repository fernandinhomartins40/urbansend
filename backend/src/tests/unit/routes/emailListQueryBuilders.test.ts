import knex from 'knex';
import { afterAll, describe, expect, it } from '@jest/globals';
import { buildEmailListStatsQuery } from '../../../routes/emailListQueryBuilders';

const database = knex({ client: 'pg' });

const normalizeSql = (sql: string) => sql
  .replace(/["`\[\]]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

describe('emailListQueryBuilders', () => {
  afterAll(async () => {
    await database.destroy();
  });

  it('builds list stats without legacy opened_at or clicked_at columns', () => {
    const query = buildEmailListStatsQuery(database, {
      userId: 5,
      status: 'all',
      search: 'invoice',
      dateFilter: 'month',
      domainFilter: 'gmail.com'
    });

    const normalizedSql = normalizeSql(query.toSQL().sql);

    expect(normalizedSql).toContain('emails.user_id');
    expect(normalizedSql).toContain('email_analytics.event_type IN');
    expect(normalizedSql).not.toContain('opened_at');
    expect(normalizedSql).not.toContain('clicked_at');
  });
});
