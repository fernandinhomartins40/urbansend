/**
 * @ultrazend/smtp-server - Migration 006
 * Criar tabela de tentativas de autenticação
 */

exports.up = async function(knex) {
  await knex.schema.createTable('auth_attempts', function (table) {
    table.increments('id').primary();
    table.string('username').notNullable();
    table.string('remote_address').notNullable();
    table.boolean('success').notNullable();
    table.string('failure_reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('username');
    table.index('remote_address');
    table.index('success');
    table.index('created_at');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('auth_attempts');
};