/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('security_blacklists', function (table) {
    table.increments('id').primary();
    table.string('ip_address', 45).unique().notNullable();
    table.text('reason').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.string('added_by').defaultTo('system');
    table.datetime('expires_at').nullable();
    table.datetime('last_seen').nullable();
    table.timestamps(true, true);

    table.index(['ip_address', 'is_active']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('security_blacklists');
};
