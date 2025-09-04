exports.up = async function(knex) {
  await knex.schema.createTable('user_engagement', function (table) {
    table.increments('id').primary();
    table.string('user_id').notNullable();
    table.string('email_address').notNullable();
    table.integer('total_emails_received').defaultTo(0);
    table.integer('total_opens').defaultTo(0);
    table.integer('total_clicks').defaultTo(0);
    table.datetime('last_open').nullable();
    table.datetime('last_click').nullable();
    table.decimal('engagement_score', 3, 2).defaultTo(0);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);

    table.index('user_id');
    table.index('engagement_score');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('user_engagement');
};
