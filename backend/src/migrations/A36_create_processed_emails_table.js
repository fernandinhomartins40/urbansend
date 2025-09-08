exports.up = async function(knex) {
  await knex.schema.createTable('processed_emails', function (table) {
    table.increments('id').primary();
    table.string('message_id', 255).unique();
    table.string('from_address', 255).notNullable();
    table.string('to_address', 255).notNullable();
    table.string('subject', 500);
    table.string('direction', 20).notNullable();
    table.string('status', 50).notNullable();
    table.string('processing_result', 100);
    table.text('rejection_reason');
    table.json('security_checks');
    table.integer('size_bytes');
    table.boolean('has_attachments').defaultTo(false);
    table.integer('attachment_count').defaultTo(0);
    table.boolean('dkim_valid');
    table.string('spf_result', 20);
    table.timestamp('processed_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);
    
    table.index(['direction', 'status']);
    table.index('processed_at');
    table.index('from_address');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('processed_emails');
};
