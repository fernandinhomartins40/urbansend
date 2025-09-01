/**
 * Migration consolidada para corrigir e completar o schema do banco
 * Esta migration adiciona as colunas DKIM que estavam faltando
 */

exports.up = async function(knex) {
  // Verificar se a tabela dkim_keys já tem as colunas necessárias
  const hasAlgorithm = await knex.schema.hasColumn('dkim_keys', 'algorithm');
  
  if (!hasAlgorithm) {
    // Adicionar colunas DKIM que estavam faltando
    await knex.schema.table('dkim_keys', function (table) {
      table.string('algorithm', 50).defaultTo('rsa-sha256');
      table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
      table.integer('key_size').defaultTo(2048);
    });
  }
};

exports.down = async function(knex) {
  // Remover as colunas adicionadas
  const hasAlgorithm = await knex.schema.hasColumn('dkim_keys', 'algorithm');
  
  if (hasAlgorithm) {
    await knex.schema.table('dkim_keys', function (table) {
      table.dropColumn('algorithm');
      table.dropColumn('canonicalization'); 
      table.dropColumn('key_size');
    });
  }
};