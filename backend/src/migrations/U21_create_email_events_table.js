exports.up = async function(knex) {
  await knex.schema.createTable('email_events', function (table) {
    table.increments('id').primary();
    table.string('email_id').notNullable();
    table.string('campaign_id').nullable();
    table.string('user_id').nullable();
    table.string('event_type').notNullable();
    table.datetime('timestamp').notNullable();
    table.string('recipient_email').nullable();
    table.string('domain').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.text('metadata').nullable();
    table.timestamps(true, true);

    table.index(['email_id', 'event_type']);
    table.index('timestamp');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('email_events');
};
