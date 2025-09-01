exports.up = function(knex) {
  return knex.schema.createTable('dkim_keys', function(table) {
    table.increments('id').primary();
    table.string('domain', 253).notNullable();
    table.string('selector', 50).notNullable().defaultTo('default');
    table.text('private_key').notNullable();
    table.text('public_key').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['domain']);
    table.index(['selector']);
    table.index(['is_active']);
    
    // Unique constraint
    table.unique(['domain', 'selector']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('dkim_keys');
};