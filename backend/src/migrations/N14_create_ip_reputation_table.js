/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('ip_reputation', function (table) {
    table.increments('id').primary();
    table.string('ip_address', 45).unique().notNullable();
    table.decimal('reputation_score', 3, 2).defaultTo(1.0);
    table.integer('total_connections').defaultTo(0);
    table.integer('successful_connections').defaultTo(0);
    table.integer('blocked_connections').defaultTo(0);
    table.integer('spam_reports').defaultTo(0);
    table.datetime('last_activity').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index('ip_address');
    table.index('reputation_score');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('ip_reputation');
};
