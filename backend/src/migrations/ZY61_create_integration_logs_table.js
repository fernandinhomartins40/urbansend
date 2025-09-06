exports.up = function(knex) {
  return knex.schema.createTable('integration_logs', table => {
    table.increments('id').primary();
    table.integer('integration_id').notNullable();
    table.enum('direction', ['incoming', 'outgoing']).notNullable();
    table.enum('status', ['success', 'failed', 'pending', 'retrying']).notNullable();
    table.string('event_type').nullable(); // Type of event that triggered this log
    table.string('external_id').nullable(); // ID from external system
    table.integer('http_status_code').nullable();
    table.text('request_url').nullable();
    table.string('request_method').nullable();
    table.json('request_headers').nullable();
    table.text('request_payload').nullable();
    table.json('response_headers').nullable();
    table.text('response_payload').nullable();
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamp('next_retry_at').nullable();
    table.integer('processing_time_ms').nullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.foreign('integration_id').references('integrations.id').onDelete('CASCADE');
    table.index(['integration_id', 'status']);
    table.index(['direction']);
    table.index(['status']);
    table.index(['event_type']);
    table.index(['created_at']);
    table.index(['next_retry_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('integration_logs');
};