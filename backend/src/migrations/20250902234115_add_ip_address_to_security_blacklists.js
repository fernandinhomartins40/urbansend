/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('security_blacklists', function(table) {
    table.string('ip_address', 45).nullable().index();
    table.index(['ip_address', 'is_active'], 'idx_blacklists_ip_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('security_blacklists', function(table) {
    table.dropIndex(['ip_address', 'is_active'], 'idx_blacklists_ip_active');
    table.dropColumn('ip_address');
  });
};
