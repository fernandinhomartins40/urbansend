/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('user_domain_permissions', function(table) {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('domain', 255).notNullable();
    table.string('permission_type', 50).defaultTo('send');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('granted_at').defaultTo(knex.fn.now());
    table.integer('granted_by');
    
    // Foreign keys
    table.foreign('user_id').references('id').inTable('users');
    table.foreign('granted_by').references('id').inTable('users');
    
    // Unique constraint
    table.unique(['user_id', 'domain'], 'unique_user_domain');
    
    // Indexes for performance
    table.index(['user_id', 'is_active'], 'idx_user_domain_permissions_active');
    table.index('domain', 'idx_user_domain_permissions_domain');
    table.index('granted_at', 'idx_user_domain_permissions_granted_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('user_domain_permissions');
};