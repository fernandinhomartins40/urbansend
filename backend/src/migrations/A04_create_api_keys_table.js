/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('api_keys', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name').notNullable();
    table.string('key_hash').notNullable();
    table.string('key_preview', 10).notNullable();
    table.text('permissions').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_used');
    table.timestamp('expires_at').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'is_active']);
    table.index('key_hash');
    table.index('expires_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('api_keys');
};
