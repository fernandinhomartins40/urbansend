/**
 * PHASE 1.1 - Analytics Enhancements
 * Adds temporal metrics fields to email_analytics.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const client = (knex?.client?.config?.client || '').toLowerCase();
  const isPostgres = client === 'pg' || client === 'postgres' || client === 'postgresql';

  await knex.schema.alterTable('email_analytics', function(table) {
    table.integer('hour_sent').nullable().comment('Hour of day when the email was sent (0-23)');
    table.integer('day_of_week').nullable().comment('Day of week (0=sunday, 6=saturday)');
    table.string('timezone', 50).nullable().comment('User timezone');
    table.json('engagement_metadata').nullable().comment('Additional engagement metadata');
  });

  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_hour ON email_analytics(hour_sent)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_dow ON email_analytics(day_of_week)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_temporal ON email_analytics(user_id, hour_sent, day_of_week)');

  await knex.schema.createTable('ip_domain_reputation', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('ip_address', 45).nullable();
    table.string('domain_name').nullable();
    table.string('reputation_type').notNullable();
    table.decimal('reputation_score', 5, 2).defaultTo(100.00).comment('Score 0-100');
    table.integer('total_sent').defaultTo(0);
    table.integer('total_delivered').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_complained').defaultTo(0);
    table.decimal('delivery_rate', 5, 2).defaultTo(0);
    table.decimal('bounce_rate', 5, 2).defaultTo(0);
    table.decimal('complaint_rate', 5, 2).defaultTo(0);
    table.json('reputation_factors').nullable().comment('Factors that affect reputation');
    table.timestamp('last_updated').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'reputation_type']);
    table.index('ip_address');
    table.index('domain_name');
    table.index('reputation_score');
  });

  const hourExpression = isPostgres
    ? "CAST(EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') AS INTEGER)"
    : "CAST(strftime('%H', created_at) AS INTEGER)";
  const dayOfWeekExpression = isPostgres
    ? "CAST(EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo') AS INTEGER)"
    : "CAST(strftime('%w', created_at) AS INTEGER)";

  await knex.raw(`
    UPDATE email_analytics
    SET
      hour_sent = ${hourExpression},
      day_of_week = ${dayOfWeekExpression},
      timezone = COALESCE(timezone, 'America/Sao_Paulo')
    WHERE hour_sent IS NULL OR day_of_week IS NULL OR timezone IS NULL
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('ip_domain_reputation');

  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_hour');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_dow');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_temporal');

  await knex.schema.alterTable('email_analytics', function(table) {
    table.dropColumn('hour_sent');
    table.dropColumn('day_of_week');
    table.dropColumn('timezone');
    table.dropColumn('engagement_metadata');
  });
};
