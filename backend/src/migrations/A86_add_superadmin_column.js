/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function up(knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn('users', 'is_superadmin');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.boolean('is_superadmin').notNullable().defaultTo(false);
    });
  }

  await knex('users')
    .whereNull('is_superadmin')
    .update({ is_superadmin: false });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function down(knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn('users', 'is_superadmin');
  if (!hasColumn) {
    return;
  }

  try {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('is_superadmin');
    });
  } catch (_error) {
    // SQLite may not support drop column on legacy versions; keep migration rollback resilient.
  }
};
