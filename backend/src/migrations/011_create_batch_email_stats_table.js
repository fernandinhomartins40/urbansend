/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('batch_email_stats', function (table) {
    table.increments('id').primary();
    table.string('batch_id', 100).notNullable().unique();
    table.integer('user_id').unsigned().notNullable();
    table.integer('total_emails').notNullable();
    table.integer('successful_emails').defaultTo(0);
    table.integer('failed_emails').defaultTo(0);
    table.decimal('success_rate', 5, 2).defaultTo(0);
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices
    table.index(['user_id'], 'idx_batch_stats_user_id');
    table.index(['batch_id'], 'idx_batch_stats_batch_id');
    table.index(['started_at'], 'idx_batch_stats_started_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('batch_email_stats');
};