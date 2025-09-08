/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('email_audit_logs', function(table) {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('email_id', 255);
    table.string('original_from', 255).notNullable();
    table.string('final_from', 255).notNullable();
    table.boolean('was_modified').defaultTo(false);
    table.text('modification_reason');
    table.string('dkim_domain', 255).notNullable();
    table.string('delivery_status', 20).notNullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.json('metadata');
    
    // Foreign keys
    table.foreign('user_id').references('id').inTable('users');
    
    // Indexes for performance
    table.index(['user_id', 'timestamp'], 'idx_email_audit_user_timestamp');
    table.index('delivery_status', 'idx_email_audit_delivery_status');
    table.index('timestamp', 'idx_email_audit_timestamp');
    table.index('was_modified', 'idx_email_audit_was_modified');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('email_audit_logs');
};