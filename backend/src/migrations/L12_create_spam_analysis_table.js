/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('spam_analysis', function (table) {
    table.increments('id').primary();
    table.string('email_id').nullable();
    table.decimal('spam_score', 5, 2).notNullable();
    table.boolean('is_spam').notNullable();
    table.text('reason').nullable();
    table.text('details').nullable();
    table.string('sender_ip', 45).nullable();
    table.string('sender_email').nullable();
    table.string('subject_hash').nullable();
    table.datetime('analyzed_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index('analyzed_at');
    table.index('is_spam');
    table.index('sender_ip');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('spam_analysis');
};
