exports.up = async function(knex) {
  await knex.schema.createTable('auth_attempts', function (table) {
    table.increments('id').primary();
    table.string('username', 255).notNullable();
    table.string('remote_address', 45).notNullable();
    table.boolean('success').notNullable();
    table.timestamps(true, true);
    
    table.index(['username', 'success']);
    table.index(['remote_address', 'success']);
    table.index('created_at');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('auth_attempts');
};
