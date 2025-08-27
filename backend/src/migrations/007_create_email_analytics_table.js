exports.up = function(knex) {
  return knex.schema.createTable('email_analytics', function(table) {
    table.increments('id').primary();
    table.integer('email_id').unsigned().notNullable();
    table.string('event_type').notNullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());
    table.string('user_agent').nullable();
    table.string('ip_address').nullable();
    table.text('metadata').nullable();
    
    table.foreign('email_id').references('id').inTable('emails').onDelete('CASCADE');
    table.index(['email_id']);
    table.index(['event_type']);
    table.index(['timestamp']);
    table.index(['ip_address']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_analytics');
};