/**
 * FASE 1.1 - Analytics Enhancements
 * Adiciona campos para métricas de horário e dia da semana em email_analytics
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Adicionar campos para análise temporal
  await knex.schema.alterTable('email_analytics', function (table) {
    table.integer('hour_sent').nullable().comment('Hora do dia quando o email foi enviado (0-23)');
    table.integer('day_of_week').nullable().comment('Dia da semana (0=domingo, 6=sábado)');
    table.string('timezone', 50).nullable().comment('Timezone do usuário');
    table.json('engagement_metadata').nullable().comment('Dados adicionais de engajamento');
  });

  // Criar índices para performance de queries temporais
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_hour ON email_analytics(hour_sent)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_dow ON email_analytics(day_of_week)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_email_analytics_temporal ON email_analytics(user_id, hour_sent, day_of_week)');
  
  // Criar nova tabela para métricas de reputação IP/domínio
  await knex.schema.createTable('ip_domain_reputation', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('ip_address', 45).nullable();
    table.string('domain_name').nullable();
    table.string('reputation_type').notNullable(); // 'ip' ou 'domain'
    table.decimal('reputation_score', 5, 2).defaultTo(100.00).comment('Score 0-100');
    table.integer('total_sent').defaultTo(0);
    table.integer('total_delivered').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_complained').defaultTo(0);
    table.decimal('delivery_rate', 5, 2).defaultTo(0);
    table.decimal('bounce_rate', 5, 2).defaultTo(0);
    table.decimal('complaint_rate', 5, 2).defaultTo(0);
    table.json('reputation_factors').nullable().comment('Fatores que afetam a reputação');
    table.timestamp('last_updated').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'reputation_type']);
    table.index('ip_address');
    table.index('domain_name');
    table.index('reputation_score');
  });

  // Popular dados existentes com informações temporais
  await knex.raw(`
    UPDATE email_analytics 
    SET 
      hour_sent = CAST(strftime('%H', created_at) AS INTEGER),
      day_of_week = CAST(strftime('%w', created_at) AS INTEGER),
      timezone = 'America/Sao_Paulo'
    WHERE hour_sent IS NULL OR day_of_week IS NULL
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Remove nova tabela
  await knex.schema.dropTableIfExists('ip_domain_reputation');
  
  // Remove índices
  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_hour');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_dow');
  await knex.schema.raw('DROP INDEX IF EXISTS idx_email_analytics_temporal');
  
  // Remove colunas adicionadas
  await knex.schema.alterTable('email_analytics', function (table) {
    table.dropColumn('hour_sent');
    table.dropColumn('day_of_week');
    table.dropColumn('timezone');
    table.dropColumn('engagement_metadata');
  });
};