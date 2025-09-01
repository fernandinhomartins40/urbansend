exports.up = function(knex) {
  return knex.schema.createTable('suppression_lists', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('CASCADE');
    
    // Email suppression info
    table.string('email', 255).notNullable();
    table.enum('type', ['bounce', 'complaint', 'manual', 'global']).notNullable();
    table.enum('bounce_type', ['hard', 'soft', 'block']).nullable();
    table.string('reason', 500).nullable();
    table.text('metadata').nullable(); // JSON
    
    // Timestamps
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['email']);
    table.index(['type']);
    table.index(['bounce_type']);
    table.index(['user_id']);
    table.index(['created_at']);
    
    // Unique constraint (null user_id means global suppression)
    table.unique(['user_id', 'email']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('suppression_lists');
};