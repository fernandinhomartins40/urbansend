/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('system_config', function (table) {
    table.increments('id').primary();
    table.string('key', 255).notNullable().unique();
    table.text('value');
    table.string('type', 50).defaultTo('string'); // 'string', 'number', 'boolean', 'json'
    table.text('description');
    table.boolean('is_public').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Índices
    table.index(['key'], 'idx_system_config_key');
    table.index(['is_public'], 'idx_system_config_public');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('system_config');
};