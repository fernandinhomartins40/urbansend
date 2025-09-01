exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.string('plan_type', 50).defaultTo('free');
    
    // Email verification
    table.string('verification_token', 255).nullable();
    table.datetime('verification_token_expires').nullable();
    
    // Password reset
    table.string('reset_token', 255).nullable();
    table.datetime('reset_token_expires').nullable();
    
    // Timestamps
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['email']);
    table.index(['is_verified']);
    table.index(['plan_type']);
    table.index(['verification_token']);
    table.index(['reset_token']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};