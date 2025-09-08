/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('phishing_detection', function (table) {
    table.increments('id').primary();
    table.string('email_id').nullable();
    table.decimal('confidence_score', 3, 2).notNullable();
    table.boolean('is_phishing').notNullable();
    table.text('indicators').nullable();
    table.text('suspicious_urls').nullable();
    table.string('sender_domain').nullable();
    table.datetime('detected_at').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index('detected_at');
    table.index('is_phishing');
    table.index('sender_domain');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('phishing_detection');
};
