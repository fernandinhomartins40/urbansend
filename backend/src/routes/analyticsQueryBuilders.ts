import { Knex } from 'knex';
import { sqlExtractDomain } from '../utils/sqlDialect';

export const analyticsEmailColumns = {
  userId: 'emails.user_id',
  createdAt: 'emails.created_at',
  fromEmail: 'emails.from_email',
  toEmail: 'emails.to_email'
} as const;

export const applyDateRange = (
  query: Knex.QueryBuilder,
  column: string,
  startDate: Date,
  endDate?: Date
) => {
  query.where(column, '>=', startDate);

  if (endDate) {
    query.where(column, '<=', endDate);
  }

  return query;
};

export const applySenderDomainFilter = (
  query: Knex.QueryBuilder,
  column: string,
  domain?: string | null
) => {
  if (!domain) {
    return query;
  }

  return query.whereRaw(`${sqlExtractDomain(column)} = ?`, [domain]);
};

export const buildFilteredEmailQuery = (
  database: Knex,
  userId: number,
  startDate: Date,
  endDate?: Date,
  senderDomain?: string | null
) => applySenderDomainFilter(
  applyDateRange(
    database('emails').where(analyticsEmailColumns.userId, userId),
    analyticsEmailColumns.createdAt,
    startDate,
    endDate
  ),
  analyticsEmailColumns.fromEmail,
  senderDomain
);

export const buildFilteredAnalyticsQuery = (
  database: Knex,
  userId: number,
  startDate: Date,
  endDate?: Date,
  senderDomain?: string | null
) => {
  const query = database('email_analytics')
    .join('emails', 'email_analytics.email_id', '=', 'emails.id')
    .where(analyticsEmailColumns.userId, userId);

  return applySenderDomainFilter(
    applyDateRange(query, analyticsEmailColumns.createdAt, startDate, endDate),
    analyticsEmailColumns.fromEmail,
    senderDomain
  );
};
