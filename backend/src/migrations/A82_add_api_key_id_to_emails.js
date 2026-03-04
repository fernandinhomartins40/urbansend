/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('emails', 'api_key_id');

  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('emails', function(table) {
    table.integer('api_key_id').unsigned().nullable();
    table.index(['api_key_id'], 'idx_emails_api_key_id');
    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('SET NULL');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('emails', 'api_key_id');

  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('emails', function(table) {
    table.dropForeign(['api_key_id']);
    table.dropIndex(['api_key_id'], 'idx_emails_api_key_id');
    table.dropColumn('api_key_id');
  });
};
