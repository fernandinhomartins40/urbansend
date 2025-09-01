exports.up = function(knex) {
  return knex.schema.createTable('emails', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.integer('api_key_id').unsigned().nullable()
      .references('id').inTable('api_keys').onDelete('SET NULL');
    table.integer('template_id').unsigned().nullable()
      .references('id').inTable('email_templates').onDelete('SET NULL');
    
    // Email content
    table.string('from_email', 255).notNullable();
    table.string('to_email', 255).notNullable();
    table.string('subject', 255).notNullable();
    table.text('html_content').nullable();
    table.text('text_content').nullable();
    
    // Status tracking
    table.string('status', 50).defaultTo('queued');
    table.datetime('sent_at').nullable();
    table.datetime('delivered_at').nullable();
    table.datetime('opened_at').nullable();
    table.datetime('clicked_at').nullable();
    
    // Bounce handling
    table.text('bounce_reason').nullable();
    table.string('bounce_type', 20).nullable(); // hard, soft, block
    
    // Webhook and tracking
    table.text('webhook_payload').nullable();
    table.string('tracking_id', 255).nullable();
    
    // Timestamps
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['api_key_id']);
    table.index(['template_id']);
    table.index(['status']);
    table.index(['from_email']);
    table.index(['to_email']);
    table.index(['sent_at']);
    table.index(['created_at']);
    table.index(['tracking_id']);
    table.index(['bounce_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('emails');
};