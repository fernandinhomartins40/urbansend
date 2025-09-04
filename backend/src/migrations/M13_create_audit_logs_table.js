/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned();
    table.string('action', 100).notNullable();
    table.string('resource_type', 50).notNullable();
    table.integer('resource_id').unsigned();
    table.json('old_values');
    table.json('new_values');
    table.string('ip_address', 45);
    table.string('user_agent', 1000);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign key (nullable for system actions)
    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    
    // Índices
    table.index(['user_id'], 'idx_audit_logs_user_id');
    table.index(['action'], 'idx_audit_logs_action');
    table.index(['resource_type'], 'idx_audit_logs_resource_type');
    table.index(['created_at'], 'idx_audit_logs_created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
};