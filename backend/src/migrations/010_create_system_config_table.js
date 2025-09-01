exports.up = function(knex) {
  return knex.schema.createTable('system_config', function(table) {
    table.increments('id').primary();
    table.string('key', 100).notNullable().unique();
    table.text('value').notNullable();
    table.string('description', 500).nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['key']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('system_config');
};