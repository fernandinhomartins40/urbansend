exports.up = function(knex) {
  return knex.schema.createTable('integrations', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('integration_name').notNullable();
    table.enum('integration_type', ['webhook_incoming', 'webhook_outgoing', 'api_external', 'zapier', 'shopify', 'woocommerce', 'mailchimp', 'hubspot', 'salesforce', 'custom']).notNullable();
    table.enum('status', ['active', 'inactive', 'error', 'testing']).defaultTo('inactive');
    table.text('description').nullable();
    table.string('endpoint_url').nullable(); // For webhook integrations
    table.string('api_key').nullable(); // Encrypted API key for external APIs
    table.string('secret_token').nullable(); // For webhook verification
    table.json('configuration').nullable(); // Integration-specific config
    table.json('field_mapping').nullable(); // How to map fields between systems
    table.json('trigger_events').nullable(); // What events trigger this integration
    table.boolean('is_bidirectional').defaultTo(false); // Can both send and receive data
    table.integer('requests_made').defaultTo(0);
    table.integer('successful_requests').defaultTo(0);
    table.integer('failed_requests').defaultTo(0);
    table.timestamp('last_sync_at').nullable();
    table.timestamp('last_error_at').nullable();
    table.text('last_error_message').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.index(['user_id', 'status']);
    table.index(['integration_type']);
    table.index(['status']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('integrations');
};