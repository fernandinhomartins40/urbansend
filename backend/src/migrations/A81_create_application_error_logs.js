exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('application_error_logs');
  if (exists) {
    return;
  }

  await knex.schema.createTable('application_error_logs', function(table) {
    table.increments('id').primary();
    table.string('source', 32).notNullable().index();
    table.string('level', 16).notNullable().defaultTo('error').index();
    table.string('environment', 32).notNullable();
    table.string('service', 100).notNullable();
    table.text('message').notNullable();
    table.string('error_name', 255).nullable();
    table.text('stack').nullable();
    table.string('error_code', 100).nullable();
    table.string('request_id', 100).nullable().index();
    table.string('correlation_id', 100).nullable().index();
    table.integer('user_id').nullable().index();
    table.string('session_id', 150).nullable();
    table.string('method', 16).nullable();
    table.string('path', 500).nullable();
    table.text('url').nullable();
    table.string('ip', 100).nullable();
    table.text('user_agent').nullable();
    table.integer('status_code').nullable();
    table.string('component', 255).nullable();
    table.text('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now()).index();
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('application_error_logs');
};
