/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('queue_job_failures', function (table) {
    table.increments('id').primary();
    table.string('queue_type', 50).notNullable();
    table.string('job_id', 100).notNullable();
    table.string('job_name', 100).notNullable();
    table.text('job_data');
    table.text('error_message').notNullable();
    table.text('error_stack');
    table.integer('attempts_made').defaultTo(0);
    table.integer('max_attempts').defaultTo(1);
    table.timestamp('failed_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    // Índices
    table.index(['job_id'], 'idx_queue_job_failures_job_id');
    table.index(['queue_type', 'failed_at'], 'idx_queue_job_failures_queue_type_failed_at');
    table.index(['failed_at'], 'idx_queue_job_failures_failed_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('queue_job_failures');
};