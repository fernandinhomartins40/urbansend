exports.up = function(knex) {
  return knex.schema.createTable('domains', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('domain_name').notNullable();
    table.string('verification_status').defaultTo('pending');
    table.text('dns_records').nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('verified_at').nullable();
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id', 'domain_name']);
    table.index(['user_id']);
    table.index(['domain_name']);
    table.index(['verification_status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('domains');
};