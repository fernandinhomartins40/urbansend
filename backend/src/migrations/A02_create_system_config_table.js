/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('system_config', function (table) {
    table.increments('id').primary();
    table.string('key').unique().notNullable();
    table.text('value').nullable();
    table.string('type').defaultTo('string');
    table.text('description').nullable();
    table.boolean('is_public').defaultTo(false);
    table.timestamps(true, true);

    table.index('key');
    table.index('is_public');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('system_config');
};
