/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('webhooks', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('url').notNullable();
    table.string('name').notNullable();
    table.json('events').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.string('secret').nullable();
    table.integer('max_retries').defaultTo(3);
    table.integer('timeout_ms').defaultTo(30000);
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('user_id');
    table.index('is_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('webhooks');
};
