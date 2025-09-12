/**
 * @ultrazend/smtp-internal - Migration 001
 * Criar tabela básica de emails
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
    table.enum('status', ['pending', 'sent', 'failed']).defaultTo('pending');
    table.enum('email_type', ['verification', 'password_reset', 'notification']).notNullable();
    table.timestamp('sent_at').nullable();
    table.text('error_message').nullable();
    table.integer('attempts').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index('message_id');
    table.index('to_email');
    table.index('status');
    table.index('email_type');
    table.index('sent_at');
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTable('emails');
};