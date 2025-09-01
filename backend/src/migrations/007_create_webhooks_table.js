exports.up = function(knex) {
  return knex.schema.createTable('webhooks', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    
    // Webhook configuration
    table.string('url', 500).notNullable();
    table.text('events').notNullable(); // JSON array
    table.string('secret', 255).nullable();
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['is_active']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('webhooks');
};