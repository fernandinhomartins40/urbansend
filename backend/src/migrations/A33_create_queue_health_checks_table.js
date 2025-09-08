exports.up = async function(knex) {
  await knex.schema.createTable('queue_health_checks', function (table) {
    table.increments('id').primary();
    table.string('overall_status').notNullable();
    table.boolean('redis_connected').defaultTo(true);
    table.integer('total_jobs').defaultTo(0);
    table.integer('total_failures').defaultTo(0);
    table.integer('issues_count').defaultTo(0);
    table.text('issues_details').nullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());

    table.index('timestamp');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('queue_health_checks');
};
