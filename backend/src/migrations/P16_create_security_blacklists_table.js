/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('security_blacklists', function(table) {
    table.increments('id').primary();
    table.string('type', 50).notNullable(); // 'ip', 'email', 'domain', 'user_agent'
    table.string('value', 500).notNullable();
    table.string('reason', 1000);
    table.string('severity', 20).defaultTo('medium'); // 'low', 'medium', 'high', 'critical'
    table.timestamp('expires_at').nullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('created_by').unsigned().nullable();
    table.timestamps(true, true);
    
    // Indexes
    table.index(['type', 'value'], 'idx_blacklist_type_value');
    table.index(['is_active', 'expires_at'], 'idx_blacklist_active_expires');
    table.index('created_by', 'idx_blacklist_created_by');
    
    // Foreign keys
    table.foreign('created_by').references('id').inTable('users').onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('security_blacklists');
};