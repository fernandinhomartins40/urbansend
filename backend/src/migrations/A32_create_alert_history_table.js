exports.up = async function(knex) {
  await knex.schema.createTable('alert_history', function (table) {
    table.increments('id').primary();
    table.string('alert_id').notNullable();
    table.string('queue_name').nullable();
    table.string('condition_type').notNullable();
    table.decimal('trigger_value', 10, 2).nullable();
    table.decimal('threshold_value', 10, 2).nullable();
    table.text('message').nullable();
    table.boolean('resolved').defaultTo(false);
    table.datetime('triggered_at').defaultTo(knex.fn.now());
    table.datetime('resolved_at').nullable();

    table.index(['alert_id', 'triggered_at']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('alert_history');
};
