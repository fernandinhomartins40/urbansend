exports.up = function(knex) {
  return knex.schema.createTable('api_keys', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('key_name').notNullable();
    table.string('api_key_hash').notNullable().unique();
    table.text('permissions').notNullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('last_used_at').nullable();
    table.boolean('is_active').defaultTo(true);
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id']);
    table.index(['api_key_hash']);
    table.index(['is_active']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('api_keys');
};