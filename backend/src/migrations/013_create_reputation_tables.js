exports.up = async function(knex) {
  // Create reputation_domains table
  await knex.schema.createTable('reputation_domains', function(table) {
    table.increments('id').primary();
    table.string('domain', 253).notNullable().unique();
    table.float('reputation_score').defaultTo(100.0);
    table.integer('total_sent').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_complaints').defaultTo(0);
    table.datetime('last_updated').defaultTo(knex.fn.now());
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    table.index(['domain']);
    table.index(['reputation_score']);
    table.index(['last_updated']);
  });

  // Create reputation_mx_servers table
  await knex.schema.createTable('reputation_mx_servers', function(table) {
    table.increments('id').primary();
    table.string('mx_server', 253).notNullable().unique();
    table.float('reputation_score').defaultTo(100.0);
    table.integer('total_sent').defaultTo(0);
    table.integer('total_bounced').defaultTo(0);
    table.integer('total_complaints').defaultTo(0);
    table.datetime('last_updated').defaultTo(knex.fn.now());
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    table.index(['mx_server']);
    table.index(['reputation_score']);
    table.index(['last_updated']);
  });

  // Create rate_limits table
  await knex.schema.createTable('rate_limits', function(table) {
    table.increments('id').primary();
    table.string('identifier', 255).notNullable(); // IP, domain, etc
    table.string('type', 50).notNullable(); // 'ip', 'domain', 'mx'
    table.integer('requests').defaultTo(0);
    table.datetime('window_start').defaultTo(knex.fn.now());
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    table.index(['identifier', 'type']);
    table.index(['window_start']);
    table.unique(['identifier', 'type']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('rate_limits');
  await knex.schema.dropTableIfExists('reputation_mx_servers');  
  await knex.schema.dropTableIfExists('reputation_domains');
};