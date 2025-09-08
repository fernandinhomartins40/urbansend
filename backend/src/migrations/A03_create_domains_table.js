/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('domains', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('domain_name').unique().notNullable();
    table.string('verification_token').notNullable();
    table.boolean('is_verified').defaultTo(false);
    table.timestamp('verified_at').nullable();
    table.string('verification_method').defaultTo('dns');
    table.text('dns_records').nullable();
    table.boolean('dkim_enabled').defaultTo(true);
    table.string('dkim_selector').defaultTo('default');
    table.boolean('spf_enabled').defaultTo(true);
    table.boolean('dmarc_enabled').defaultTo(false);
    table.string('dmarc_policy').defaultTo('none');
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('user_id');
    table.index('domain_name');
    table.index('is_verified');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('domains');
};
