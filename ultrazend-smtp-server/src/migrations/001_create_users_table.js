/**
 * @ultrazend/smtp-server - Migration 001
 * Criar tabela de usuários para autenticação SMTP
 */

exports.up = async function(knex) {
  await knex.schema.createTable('users', function (table) {
    table.increments('id').primary();
    table.string('email').unique().notNullable();
    table.string('password_hash').notNullable();
    table.string('name').notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_admin').defaultTo(false);
    table.timestamp('last_login');
    table.timestamps(true, true);

    table.index('email');
    table.index('is_active');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('users');
};