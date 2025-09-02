/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('emails', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('api_key_id').unsigned();
    table.integer('template_id').unsigned();
    table.string('to_email', 255).notNullable();
    table.string('from_email', 255).notNullable();
    table.string('reply_to', 255);
    table.string('subject', 500).notNullable();
    table.text('html_content');
    table.text('text_content');
    table.json('cc_emails').defaultTo('[]');
    table.json('bcc_emails').defaultTo('[]');
    table.json('attachments').defaultTo('[]');
    table.json('variables').defaultTo('{}');
    table.string('status', 50).defaultTo('pending');
    table.string('tracking_id', 100);
    table.boolean('tracking_enabled').defaultTo(false);
    table.text('error_message');
    table.timestamp('sent_at');
    table.timestamp('delivered_at');
    table.timestamp('opened_at');
    table.timestamp('clicked_at');
    table.timestamp('bounced_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign keys
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('api_key_id').references('id').inTable('api_keys').onDelete('SET NULL');
    table.foreign('template_id').references('id').inTable('email_templates').onDelete('SET NULL');
    
    // Índices
    table.index(['user_id'], 'idx_emails_user_id');
    table.index(['api_key_id'], 'idx_emails_api_key_id');
    table.index(['to_email'], 'idx_emails_to_email');
    table.index(['status'], 'idx_emails_status');
    table.index(['tracking_id'], 'idx_emails_tracking_id');
    table.index(['sent_at'], 'idx_emails_sent_at');
    table.index(['created_at'], 'idx_emails_created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('emails');
};