exports.up = async function(knex) {
  await knex.schema.createTable('health_checks', function (table) {
    table.increments('id').primary();
    table.string('service_name').notNullable();
    table.boolean('is_healthy').notNullable();
    table.text('details').nullable();
    table.text('error_message').nullable();
    table.integer('response_time_ms').nullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());

    table.index(['service_name', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('health_checks');
};
