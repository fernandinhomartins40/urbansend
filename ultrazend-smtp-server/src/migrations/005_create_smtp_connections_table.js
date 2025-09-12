/**
 * @ultrazend/smtp-server - Migration 005
 * Criar tabela de conexões SMTP
 */

exports.up = async function(knex) {
  await knex.schema.createTable('smtp_connections', function (table) {
    table.increments('id').primary();
    table.string('remote_address').notNullable();
    table.string('hostname').nullable();
    table.enum('server_type', ['mx', 'submission']).notNullable();
    table.enum('status', ['accepted', 'rejected', 'failed']).notNullable();
    table.string('reject_reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('remote_address');
    table.index('server_type');
    table.index('status');
    table.index('created_at');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('smtp_connections');
};