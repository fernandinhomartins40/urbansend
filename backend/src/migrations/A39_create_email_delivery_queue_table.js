exports.up = async function(knex) {
  await knex.schema.createTable('email_delivery_queue', function (table) {
    table.increments('id').primary();
    table.string('message_id', 255).notNullable().unique();
    table.string('from_address', 255).notNullable();
    table.string('to_address', 255).notNullable();
    table.string('subject', 500);
    table.text('body', 'longtext');
    table.json('headers');
    table.enum('status', ['pending', 'processing', 'delivered', 'failed', 'bounced', 'deferred']).defaultTo('pending');
    table.integer('attempts').defaultTo(0);
    table.timestamp('last_attempt');
    table.timestamp('next_attempt');
    table.timestamp('delivered_at');
    table.integer('delivery_time');
    table.text('error_message');
    table.integer('priority').defaultTo(50);
    table.integer('user_id').unsigned().references('id').inTable('users');
    table.integer('campaign_id');
    table.string('bounce_type', 50);
    table.json('delivery_report');
    table.timestamps(true, true);
    
    table.index(['status', 'next_attempt']);
    table.index(['priority', 'created_at']);
    table.index('to_address');
    table.index('user_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('email_delivery_queue');
};
