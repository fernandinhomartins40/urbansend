exports.up = async function(knex) {
  await knex.schema.createTable('domain_reputation', function (table) {
    table.increments('id').primary();
    table.string('domain', 255).notNullable().unique();
    table.decimal('score', 5, 2).defaultTo(100.0);
    table.integer('successful_deliveries').defaultTo(0);
    table.integer('failed_deliveries').defaultTo(0);
    table.decimal('bounce_rate', 5, 2).defaultTo(0);
    table.timestamp('last_success');
    table.timestamp('last_failure');
    table.string('status', 20).defaultTo('good');
    table.text('notes');
    table.timestamps(true, true);
    
    table.index('domain');
    table.index('score');
    table.index('status');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('domain_reputation');
};
