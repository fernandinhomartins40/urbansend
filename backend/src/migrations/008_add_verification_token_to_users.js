exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.string('verification_token').nullable();
    table.index(['verification_token']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('verification_token');
  });
};