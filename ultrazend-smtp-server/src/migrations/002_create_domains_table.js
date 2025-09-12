/**
 * @ultrazend/smtp-server - Migration 002
 * Criar tabela de domínios
 */

exports.up = async function(knex) {
  await knex.schema.createTable('domains', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('domain_name').unique().notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.string('verification_token');
    table.timestamp('verified_at');
    table.string('verification_method').defaultTo('dns');
    table.boolean('dkim_enabled').defaultTo(true);
    table.boolean('spf_enabled').defaultTo(true);
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('domain_name');
    table.index('is_verified');
    table.index('user_id');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('domains');
};