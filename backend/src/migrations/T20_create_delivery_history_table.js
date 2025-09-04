exports.up = async function(knex) {
  await knex.schema.createTable('delivery_history', function (table) {
    table.increments('id').primary();
    table.string('domain', 255).notNullable();
    table.string('mx_server', 255);
    table.string('status', 50).notNullable();
    table.string('failure_reason', 500);
    table.integer('response_time');
    table.string('recipient_email', 255);
    table.string('message_id', 255);
    table.timestamp('attempted_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);
    
    table.index(['domain', 'status']);
    table.index(['mx_server', 'status']);
    table.index('attempted_at');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('delivery_history');
};
