import { Knex } from 'knex';
import { sqlExtractDomain } from '../utils/sqlDialect';

export interface EmailListFilters {
  userId: number;
  status?: string;
  search?: string;
  dateFilter?: string;
  domainFilter?: string;
}

export const applyEmailListFilters = (query: Knex.QueryBuilder, filters: EmailListFilters) => {
  const { userId, status, search, dateFilter, domainFilter } = filters;
  query.where('emails.user_id', userId);

  if (status && status !== 'all') {
    query.where('emails.status', status);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    const searchTerm = search.trim();
    query.where(function() {
      this.where('emails.to_email', 'like', `%${searchTerm}%`)
        .orWhere('emails.subject', 'like', `%${searchTerm}%`)
        .orWhere('emails.html_content', 'like', `%${searchTerm}%`)
        .orWhere('emails.text_content', 'like', `%${searchTerm}%`);
    });
  }

  if (dateFilter && dateFilter !== 'all') {
    const now = new Date();
    let startDate: Date;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    query.where('emails.created_at', '>=', startDate.toISOString());
  }

  if (domainFilter && domainFilter !== 'all') {
    query.whereRaw(`${sqlExtractDomain('emails.to_email')} = ?`, [domainFilter]);
  }

  return query;
};

export const buildEmailListStatsQuery = (database: Knex, filters: EmailListFilters) => applyEmailListFilters(
  database('emails')
    .leftJoin('email_analytics', 'email_analytics.email_id', '=', 'emails.id')
    .select(
      database.raw('COUNT(DISTINCT emails.id) as total'),
      database.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.delivered_at IS NOT NULL
              OR emails.status IN ('sent', 'delivered', 'opened', 'clicked')
            THEN emails.id
          END
        ) as delivered
      `),
      database.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status IN ('opened', 'clicked')
              OR email_analytics.event_type IN ('open', 'opened')
            THEN emails.id
          END
        ) as opened
      `),
      database.raw(`
        COUNT(
          DISTINCT CASE
            WHEN emails.status = 'clicked'
              OR email_analytics.event_type IN ('click', 'clicked')
            THEN emails.id
          END
        ) as clicked
      `)
    ),
  filters
);
