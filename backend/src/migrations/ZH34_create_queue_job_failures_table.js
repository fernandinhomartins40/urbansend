exports.up = async function(knex) {
  await knex.schema.createTable('queue_job_failures', function (table) {
    table.increments('id').primary();
    table.string('job_id').notNullable();
    table.string('queue_name').notNullable();
    table.string('job_name').notNullable();
    table.text('job_data').nullable();
    table.text('error_message').nullable();
    table.text('stack_trace').nullable();
    table.integer('attempts').defaultTo(1);
    table.datetime('failed_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index(['queue_name', 'failed_at']);
    table.index('job_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('queue_job_failures');
};
