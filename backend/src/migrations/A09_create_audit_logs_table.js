/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('audit_logs', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.string('action').notNullable();
    table.string('resource_type').notNullable();
    table.integer('resource_id').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.json('old_values').nullable();
    table.json('new_values').nullable();
    table.text('details').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.index(['user_id', 'created_at']);
    table.index('action');
    table.index('resource_type');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('audit_logs');
};
