exports.up = function(knex) {
  return knex.schema.createTable('email_analytics', function(table) {
    table.increments('id').primary();
    table.integer('email_id').unsigned().notNullable()
      .references('id').inTable('emails').onDelete('CASCADE');
    
    // Event tracking
    table.string('event_type', 50).notNullable(); // sent, delivered, opened, clicked, bounced, failed
    table.datetime('timestamp').defaultTo(knex.fn.now());
    
    // User tracking
    table.string('user_agent', 500).nullable();
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6
    
    // Additional metadata
    table.text('metadata').nullable(); // JSON
    
    // Indexes for performance
    table.index(['email_id']);
    table.index(['event_type']);
    table.index(['timestamp']);
    table.index(['ip_address']);
    table.index(['email_id', 'event_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_analytics');
};