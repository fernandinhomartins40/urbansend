exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.datetime('verification_token_expires').nullable();
    table.index(['verification_token_expires']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('verification_token_expires');
  });
};