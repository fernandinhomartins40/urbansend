exports.up = async function(knex) {
  await knex.schema.createTable('delivery_stats', function (table) {
    table.increments('id').primary();
    table.integer('delivery_id').unsigned().references('id').inTable('email_delivery_queue');
    table.string('status', 20).notNullable();
    table.integer('delivery_time');
    table.text('error_message');
    table.timestamps(true, true);
    
    table.index(['status', 'created_at']);
    table.index('delivery_id');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('delivery_stats');
};
