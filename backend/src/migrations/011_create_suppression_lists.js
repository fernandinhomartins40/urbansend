/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('suppression_lists', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('email').notNullable();
    table.enum('type', ['bounce', 'complaint', 'manual', 'global']).notNullable();
    table.enum('bounce_type', ['hard', 'soft', 'block']).nullable();
    table.string('reason').nullable();
    table.text('metadata').nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Unique constraint per user (null user_id means global suppression)
    table.unique(['user_id', 'email']);
    table.index(['email']);
    table.index(['type']);
    table.index(['bounce_type']);
    table.index(['created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('suppression_lists');
};