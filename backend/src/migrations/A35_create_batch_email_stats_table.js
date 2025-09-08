exports.up = async function(knex) {
  await knex.schema.createTable('batch_email_stats', function (table) {
    table.increments('id').primary();
    table.string('batch_id').unique().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('total_emails').defaultTo(0);
    table.integer('sent_emails').defaultTo(0);
    table.integer('failed_emails').defaultTo(0);
    table.integer('pending_emails').defaultTo(0);
    table.datetime('batch_started').defaultTo(knex.fn.now());
    table.datetime('batch_completed').nullable();
    table.string('status').defaultTo('processing');
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('batch_id');
    table.index(['user_id', 'status']);
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('batch_email_stats');
};
