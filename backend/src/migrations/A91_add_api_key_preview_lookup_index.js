/**
 * Permite a autenticacao por API key localizar apenas a chave candidata antes
 * de executar bcrypt, em vez de percorrer todas as chaves ativas.
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('api_keys');
  if (!exists) return;
  await knex.schema.alterTable('api_keys', (table) => {
    table.index(['key_preview', 'is_active'], 'api_keys_preview_active_index');
  });
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasTable('api_keys');
  if (!exists) return;
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropIndex(['key_preview', 'is_active'], 'api_keys_preview_active_index');
  });
};
