/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasKeyType = await knex.schema.hasColumn('api_keys', 'key_type');
  if (!hasKeyType) {
    await knex.schema.alterTable('api_keys', function(table) {
      table.string('key_type', 30).notNullable().defaultTo('standard');
      table.index(['user_id', 'key_type'], 'idx_api_keys_user_key_type');
    });
  }

  const hasDescription = await knex.schema.hasColumn('api_keys', 'description');
  if (!hasDescription) {
    await knex.schema.alterTable('api_keys', function(table) {
      table.string('description', 300).nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasDescription = await knex.schema.hasColumn('api_keys', 'description');
  const hasKeyType = await knex.schema.hasColumn('api_keys', 'key_type');

  await knex.schema.alterTable('api_keys', function(table) {
    if (hasDescription) {
      table.dropColumn('description');
    }

    if (hasKeyType) {
      table.dropIndex(['user_id', 'key_type'], 'idx_api_keys_user_key_type');
      table.dropColumn('key_type');
    }
  });
};
