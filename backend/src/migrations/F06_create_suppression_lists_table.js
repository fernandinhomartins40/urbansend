/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('suppression_lists', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('email_address').notNullable();
    table.enum('reason', ['bounce', 'complaint', 'unsubscribe', 'manual']).notNullable();
    table.text('details').nullable();
    table.boolean('is_global').defaultTo(false);
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id', 'email_address']);
    table.index('email_address');
    table.index('reason');
    table.index('is_global');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('suppression_lists');
};
