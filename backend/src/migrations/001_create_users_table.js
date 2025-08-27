exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('email').notNullable().unique();
    table.string('password_hash').notNullable();
    table.string('name').notNullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.boolean('is_verified').defaultTo(false);
    table.string('plan_type').defaultTo('free');
    
    table.index(['email']);
    table.index(['is_verified']);
    table.index(['plan_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};