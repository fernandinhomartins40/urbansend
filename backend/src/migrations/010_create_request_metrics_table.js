/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('request_metrics', function (table) {
    table.increments('id').primary();
    table.string('method', 10).notNullable();
    table.string('route', 255).notNullable();
    table.integer('status_code').notNullable();
    table.decimal('response_time_ms', 10, 2).notNullable().defaultTo(0);
    table.decimal('memory_usage_mb', 10, 2);
    table.decimal('cpu_usage_percent', 5, 2);
    table.string('user_agent', 1000);
    table.string('ip_address', 45);
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    
    // Índices para performance
    table.index(['timestamp'], 'idx_request_metrics_timestamp');
    table.index(['route'], 'idx_request_metrics_route');
    table.index(['status_code'], 'idx_request_metrics_status');
    table.index(['method'], 'idx_request_metrics_method');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('request_metrics');
};