exports.up = function(knex) {
  return knex.schema.createTable('emails', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('api_key_id').unsigned().nullable();
    table.integer('template_id').unsigned().nullable();
    table.string('from_email').notNullable();
    table.string('to_email').notNullable();
    table.string('subject').notNullable();
    table.text('html_content').nullable();
    table.text('text_content').nullable();
    table.string('status').defaultTo('queued');
    table.datetime('sent_at').nullable();
    table.datetime('delivered_at').nullable();
    table.datetime('opened_at').nullable();
    table.datetime('clicked_at').nullable();
    table.text('bounce_reason').nullable();
    table.text('webhook_payload').nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('SET NULL');
    table.foreign('template_id').references('id').inTable('email_templates').onDelete('SET NULL');
    
    table.index(['user_id']);
    table.index(['status']);
    table.index(['sent_at']);
    table.index(['from_email']);
    table.index(['to_email']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('emails');
};