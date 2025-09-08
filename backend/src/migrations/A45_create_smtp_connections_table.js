exports.up = async function(knex) {
  await knex.schema.createTable('smtp_connections', function (table) {
    table.increments('id').primary();
    table.string('remote_address', 45).notNullable();
    table.string('hostname', 255);
    table.string('server_type', 20).notNullable();
    table.string('status', 20).notNullable();
    table.timestamps(true, true);
    
    table.index(['remote_address', 'server_type']);
    table.index('created_at');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('smtp_connections');
};
