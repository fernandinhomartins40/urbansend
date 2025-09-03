/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('users', function (table) {
    table.timestamp('email_verification_expires').nullable();
  });
  
  // Add index for efficient expiration queries
  await knex.schema.alterTable('users', function (table) {
    table.index(['email_verification_expires'], 'idx_users_email_verification_expires');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.alterTable('users', function (table) {
    table.dropIndex(['email_verification_expires'], 'idx_users_email_verification_expires');
    table.dropColumn('email_verification_expires');
  });
};