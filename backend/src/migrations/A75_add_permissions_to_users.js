/**
 * Adiciona coluna permissions à tabela users
 * Necessária para suporte ao middleware requirePermission
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('users', function (table) {
    // Adicionar coluna permissions como JSON com permissões padrão
    table.json('permissions').defaultTo('["email:send", "email:read"]').comment('User permissions for role-based access control');
  });

  // Atualizar usuários existentes com permissões padrão
  await knex('users').update({
    permissions: JSON.stringify(["email:send", "email:read", "domain:manage", "template:manage", "analytics:read"])
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('users', function (table) {
    table.dropColumn('permissions');
  });
};