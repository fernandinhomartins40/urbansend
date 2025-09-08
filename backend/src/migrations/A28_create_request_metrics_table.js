exports.up = async function(knex) {
  await knex.schema.createTable('request_metrics', function (table) {
    table.increments('id').primary();
    table.string('method').notNullable();
    table.string('route').notNullable();
    table.integer('status_code').notNullable();
    table.decimal('response_time_ms', 10, 2).notNullable();
    table.decimal('memory_usage_mb', 10, 2).nullable();
    table.decimal('cpu_usage_percent', 5, 2).nullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());

    table.index(['route', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('request_metrics');
};
