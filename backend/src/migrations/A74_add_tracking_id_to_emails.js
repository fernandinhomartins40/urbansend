/**
 * Adiciona coluna tracking_id à tabela emails
 * Necessária para suporte ao rastreamento de abertura de emails do MultiTenantEmailService
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('emails', function (table) {
    table.string('tracking_id').nullable().comment('Unique tracking ID for email open tracking');

    // Adicionar índice para performance em consultas de tracking
    table.index('tracking_id', 'emails_tracking_id_index');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('emails', function (table) {
    table.dropIndex('tracking_id', 'emails_tracking_id_index');
    table.dropColumn('tracking_id');
  });
};