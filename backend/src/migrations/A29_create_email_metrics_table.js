exports.up = async function(knex) {
  await knex.schema.createTable('email_metrics', function (table) {
    table.increments('id').primary();
    table.string('metric_type').notNullable();
    table.integer('user_id').nullable();
    table.string('domain').nullable();
    table.string('mx_server').nullable();
    table.string('status').nullable();
    table.integer('count').defaultTo(1);
    table.datetime('timestamp').defaultTo(knex.fn.now());

    table.index(['metric_type', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('email_metrics');
};
