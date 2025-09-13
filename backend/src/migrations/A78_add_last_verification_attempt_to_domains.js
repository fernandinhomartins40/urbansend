/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('domains', function (table) {
    table.timestamp('last_verification_attempt').nullable();

    // Adicionar índice para melhor performance nas consultas de verificação
    table.index('last_verification_attempt');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('domains', function (table) {
    table.dropIndex('last_verification_attempt');
    table.dropColumn('last_verification_attempt');
  });
};