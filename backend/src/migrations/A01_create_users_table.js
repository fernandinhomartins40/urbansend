/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('users', function (table) {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('password_hash').notNullable();
    table.string('name').notNullable();
    table.string('organization');
    table.string('phone');
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.string('verification_token');
    table.timestamp('verification_token_expires');
    table.string('reset_password_token');
    table.timestamp('reset_password_expires');
    table.timestamp('last_login');
    table.string('timezone').defaultTo('America/Sao_Paulo');
    table.string('language').defaultTo('pt-BR');
    table.timestamp('email_verified_at');
    table.timestamps(true, true);

    table.index('email');
    table.index('is_active');
    table.index('verification_token');
    table.index('reset_password_token');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('users');
};
