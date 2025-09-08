/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('security_logs', function (table) {
    table.increments('id').primary();
    table.string('event_type').notNullable();
    table.string('severity').notNullable();
    table.string('source_ip', 45).nullable();
    table.integer('user_id').nullable();
    table.string('session_id').nullable();
    table.text('details').nullable();
    table.text('action_taken').nullable();
    table.datetime('timestamp').defaultTo(knex.fn.now());

    table.index('timestamp');
    table.index('event_type');
    table.index('severity');
    table.index('source_ip');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('security_logs');
};
