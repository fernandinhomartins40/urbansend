/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('system_alerts', function(table) {
    table.increments('id').primary();
    table.string('type', 100).notNullable();
    table.string('severity', 20).notNullable();
    table.text('message').notNullable();
    table.json('data');
    table.json('actions');
    table.boolean('resolved').defaultTo(false);
    table.timestamp('resolved_at');
    table.integer('resolved_by');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('resolved_by').references('id').inTable('users');
    
    // Indexes for performance
    table.index(['severity', 'resolved'], 'idx_system_alerts_severity');
    table.index('type', 'idx_system_alerts_type');
    table.index('created_at', 'idx_system_alerts_created_at');
    table.index(['resolved', 'created_at'], 'idx_system_alerts_resolved_created');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('system_alerts');
};