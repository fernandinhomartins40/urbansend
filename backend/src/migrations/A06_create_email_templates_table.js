/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('email_templates', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name').notNullable();
    table.string('subject').notNullable();
    table.text('html_content');
    table.text('text_content');
    table.string('category').defaultTo('general');
    table.boolean('is_active').defaultTo(true);
    table.json('variables').nullable();
    table.timestamps(true, true);

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index('user_id');
    table.index('category');
    table.index('is_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTable('email_templates');
};
