exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    
    // Audit information
    table.string('action', 100).notNullable(); // login, email_verified, password_changed, etc
    table.text('details').nullable(); // JSON with action details
    
    // Request information
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6
    table.string('user_agent', 500).nullable();
    
    // Timestamp
    table.datetime('timestamp').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['action']);
    table.index(['timestamp']);
    table.index(['user_id', 'timestamp']);
    table.index(['action', 'timestamp']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('audit_logs');
};