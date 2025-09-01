/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('dkim_keys', function (table) {
    table.string('algorithm', 50).defaultTo('rsa-sha256');
    table.string('canonicalization', 50).defaultTo('relaxed/relaxed');
    table.integer('key_size').defaultTo(2048);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('dkim_keys', function (table) {
    table.dropColumn('algorithm');
    table.dropColumn('canonicalization');
    table.dropColumn('key_size');
  });
};
