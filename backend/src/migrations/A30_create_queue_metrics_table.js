exports.up = async function(knex) {
  await knex.schema.createTable('queue_metrics', function (table) {
    table.increments('id').primary();
    table.string('queue_name').notNullable();
    table.integer('waiting_jobs').defaultTo(0);
    table.integer('active_jobs').defaultTo(0);
    table.integer('completed_jobs').defaultTo(0);
    table.integer('failed_jobs').defaultTo(0);
    table.integer('delayed_jobs').defaultTo(0);
    table.boolean('is_paused').defaultTo(false);
    table.decimal('processing_rate', 10, 2).defaultTo(0);
    table.decimal('completion_rate', 5, 2).defaultTo(0);
    table.decimal('failure_rate', 5, 2).defaultTo(0);
    table.datetime('timestamp').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index(['queue_name', 'timestamp']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('queue_metrics');
};
