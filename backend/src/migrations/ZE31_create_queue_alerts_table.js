exports.up = async function(knex) {
  await knex.schema.createTable('queue_alerts', function (table) {
    table.increments('id').primary();
    table.string('alert_id').unique().notNullable();
    table.string('name').notNullable();
    table.string('queue_name').nullable();
    table.string('condition_type').notNullable();
    table.decimal('threshold_value', 10, 2).notNullable();
    table.boolean('is_enabled').defaultTo(true);
    table.integer('cooldown_minutes').defaultTo(15);
    table.text('webhook_url').nullable();
    table.text('email_recipients').nullable();
    table.timestamps(true, true);

    table.index('alert_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('queue_alerts');
};
