exports.up = async function(knex) {
  await knex.schema.createTable('email_analytics', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('email_id').notNullable();
    table.string('event_type').notNullable();
    table.string('recipient_email').notNullable();
    table.string('campaign_id').nullable();
    table.string('ip_address', 45).nullable();
    table.text('user_agent').nullable();
    table.json('metadata').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['user_id', 'event_type']);
    table.index('email_id');
    table.index('recipient_email');
    table.index('campaign_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('email_analytics');
};
