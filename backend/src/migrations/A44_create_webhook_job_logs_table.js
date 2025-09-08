exports.up = async function(knex) {
  await knex.schema.createTable('webhook_job_logs', function (table) {
    table.increments('id').primary();
    table.integer('webhook_id').unsigned().notNullable();
    table.string('job_id').notNullable();
    table.string('event_type').notNullable();
    table.text('payload');
    table.integer('attempt').defaultTo(1);
    table.string('status').defaultTo('pending');
    table.text('error_message');
    table.datetime('scheduled_at').defaultTo(knex.fn.now());
    table.datetime('processed_at');
    table.timestamps(true, true);
    
    table.foreign('webhook_id').references('id').inTable('webhooks').onDelete('CASCADE');
    table.index(['webhook_id', 'status']);
    table.index('job_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('webhook_job_logs');
};
