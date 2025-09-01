exports.up = function(knex) {
  return knex.schema.createTable('api_keys', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('key_name', 100).notNullable();
    table.string('api_key_hash', 255).notNullable().unique();
    table.text('permissions').notNullable(); // JSON array
    table.boolean('is_active').defaultTo(true);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('last_used_at').nullable();
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['api_key_hash']);
    table.index(['is_active']);
    table.index(['created_at']);
    table.index(['last_used_at']);
    
    // Unique constraint
    table.unique(['user_id', 'key_name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('api_keys');
};