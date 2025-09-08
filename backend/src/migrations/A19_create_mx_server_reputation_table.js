exports.up = async function(knex) {
  await knex.schema.createTable('mx_server_reputation', function (table) {
    table.increments('id').primary();
    table.string('mx_server', 255).notNullable();
    table.string('domain', 255).notNullable();
    table.decimal('score', 5, 2).defaultTo(100.0);
    table.integer('successful_deliveries').defaultTo(0);
    table.integer('failed_deliveries').defaultTo(0);
    table.decimal('avg_response_time', 8, 2).defaultTo(0);
    table.timestamp('last_success');
    table.timestamp('last_failure');
    table.json('failure_reasons');
    table.timestamps(true, true);
    
    table.unique(['mx_server', 'domain']);
    table.index('mx_server');
    table.index('score');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('mx_server_reputation');
};
