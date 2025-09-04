exports.up = async function(knex) {
  await knex.schema.createTable('webhook_logs', function (table) {
    table.increments('id').primary();
    table.integer('webhook_id').unsigned().notNullable();
    table.string('event').notNullable();
    table.text('payload');
    table.boolean('success').notNullable();
    table.integer('status_code').nullable();
    table.text('response_body').nullable();
    table.integer('attempt').notNullable();
    table.text('error_message').nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    
    table.foreign('webhook_id').references('id').inTable('webhooks').onDelete('CASCADE');
    table.index(['webhook_id', 'created_at']);
    table.index('event');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('webhook_logs');
};
