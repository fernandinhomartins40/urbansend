/**
 * @ultrazend/smtp-server - Migration 003
 * Criar tabela de emails processados
 */

exports.up = async function(knex) {
  await knex.schema.createTable('emails', function (table) {
    table.increments('id').primary();
    table.string('message_id').unique().notNullable();
    table.string('from_email').notNullable();
    table.string('to_email').notNullable();
    table.string('subject').notNullable();
    table.text('html_content', 'longtext');
    table.text('text_content', 'longtext');
    table.enum('status', ['pending', 'sent', 'delivered', 'bounced', 'failed']).defaultTo('pending');
    table.enum('direction', ['inbound', 'outbound']).notNullable();
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.string('mx_server').nullable();
    table.text('error_message').nullable();
    table.integer('attempts').defaultTo(0);
    table.timestamps(true, true);

    table.index('message_id');
    table.index('from_email');
    table.index('to_email');
    table.index('status');
    table.index('direction');
    table.index('sent_at');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('emails');
};