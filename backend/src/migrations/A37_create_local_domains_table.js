exports.up = async function(knex) {
  await knex.schema.createTable('local_domains', function (table) {
    table.increments('id').primary();
    table.string('domain', 255).notNullable().unique();
    table.boolean('is_active').defaultTo(true);
    table.boolean('accept_all').defaultTo(false);
    table.text('description');
    table.timestamps(true, true);
    
    table.index('domain');
    table.index('is_active');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('local_domains');
};
