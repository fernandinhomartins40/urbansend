/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('rate_limit_configs', function (table) {
    table.increments('id').primary();
    table.string('identifier', 255).notNullable();
    table.string('type', 50).notNullable();
    table.integer('max_connections').defaultTo(100);
    table.integer('max_auth_attempts').defaultTo(10);
    table.integer('max_emails_per_hour').defaultTo(5000);
    table.integer('max_emails_per_day').defaultTo(50000);
    table.boolean('is_active').defaultTo(true);
    table.text('notes');
    table.timestamps(true, true);
    
    table.unique(['identifier', 'type']);
    table.index('is_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('rate_limit_configs');
};
