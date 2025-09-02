/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('suppression_lists', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('email', 255).notNullable();
    table.string('reason', 100).notNullable(); // 'bounce', 'complaint', 'unsubscribe', 'manual'
    table.string('source', 100); // 'automatic', 'manual', 'api'
    table.text('details');
    table.timestamp('suppressed_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices
    table.index(['user_id'], 'idx_suppression_user_id');
    table.index(['email'], 'idx_suppression_email');
    table.index(['reason'], 'idx_suppression_reason');
    table.unique(['user_id', 'email'], 'idx_suppression_user_email_unique');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('suppression_lists');
};