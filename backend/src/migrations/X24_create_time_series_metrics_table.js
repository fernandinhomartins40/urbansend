exports.up = async function(knex) {
  await knex.schema.createTable('time_series_metrics', function (table) {
    table.increments('id').primary();
    table.datetime('timestamp').notNullable();
    table.string('metric_name').notNullable();
    table.decimal('metric_value', 15, 4).notNullable();
    table.text('tags').nullable();
    table.timestamps(true, true);

    table.index(['metric_name', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('time_series_metrics');
};
