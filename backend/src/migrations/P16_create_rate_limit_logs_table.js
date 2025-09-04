/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('rate_limit_logs', function (table) {
    table.increments('id').primary();
    table.string('key', 255).notNullable();
    table.string('type', 50).notNullable();
    table.string('ip_address', 45).nullable();
    table.integer('count').defaultTo(1);
    table.timestamp('window_start').notNullable();
    table.timestamp('last_request').defaultTo(knex.fn.now());
    table.timestamps(true, true);
    
    table.index(['key', 'type']);
    table.index('window_start');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('rate_limit_logs');
};
