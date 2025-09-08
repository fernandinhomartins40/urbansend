/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('rate_limit_violations', function (table) {
    table.increments('id').primary();
    table.string('identifier').notNullable();
    table.string('limit_type').notNullable();
    table.integer('violation_count').defaultTo(1);
    table.datetime('first_violation').defaultTo(knex.fn.now());
    table.datetime('last_violation').defaultTo(knex.fn.now());
    table.boolean('is_blocked').defaultTo(false);
    table.datetime('expires_at').nullable();
    table.timestamps(true, true);

    table.index(['identifier', 'limit_type']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('rate_limit_violations');
};
