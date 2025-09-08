exports.up = async function(knex) {
  await knex.schema.createTable('system_metrics', function (table) {
    table.increments('id').primary();
    table.string('metric_name').notNullable();
    table.decimal('metric_value', 15, 4).notNullable();
    table.text('labels').nullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index(['metric_name', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('system_metrics');
};
