exports.up = async function(knex) {
  await knex.schema.createTable('campaign_metrics', function (table) {
    table.increments('id').primary();
    table.string('campaign_id').unique().notNullable();
    table.string('campaign_name').nullable();
    table.integer('emails_sent').defaultTo(0);
    table.integer('emails_delivered').defaultTo(0);
    table.integer('emails_opened').defaultTo(0);
    table.integer('emails_clicked').defaultTo(0);
    table.integer('emails_bounced').defaultTo(0);
    table.integer('emails_complained').defaultTo(0);
    table.integer('emails_unsubscribed').defaultTo(0);
    table.datetime('last_updated').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index('campaign_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('campaign_metrics');
};
