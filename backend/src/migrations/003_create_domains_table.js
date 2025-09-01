exports.up = function(knex) {
  return knex.schema.createTable('domains', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('domain_name', 253).notNullable();
    table.string('verification_status', 50).defaultTo('pending');
    table.text('dns_records').nullable(); // JSON
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('verified_at').nullable();
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['domain_name']);
    table.index(['verification_status']);
    table.index(['created_at']);
    
    // Unique constraint per user
    table.unique(['user_id', 'domain_name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('domains');
};