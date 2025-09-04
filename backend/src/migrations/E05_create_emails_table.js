/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('emails', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('message_id').unique().notNullable();
    table.string('from_email').notNullable();
    table.string('from_name').nullable();
    table.string('to_email').notNullable();
    table.string('to_name').nullable();
    table.text('cc').nullable();
    table.text('bcc').nullable();
    table.string('reply_to').nullable();
    table.string('subject').notNullable();
    table.text('html_content', 'longtext');
    table.text('text_content', 'longtext');
    table.enum('status', ['pending', 'sent', 'delivered', 'bounced', 'complained', 'failed']).defaultTo('pending');
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.timestamp('bounced_at').nullable();
    table.string('bounce_reason').nullable();
    table.integer('campaign_id').nullable();
    table.integer('template_id').nullable();
    table.json('tags').nullable();
    table.json('metadata').nullable();
    table.integer('attempts').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'status']);
    table.index('message_id');
    table.index('to_email');
    table.index('status');
    table.index('sent_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('emails');
};
