/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.createTable('email_templates', function (table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('name', 255).notNullable();
    table.string('subject', 500).notNullable();
    table.text('html_content');
    table.text('text_content');
    table.json('variables').defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Índices
    table.index(['user_id'], 'idx_templates_user_id');
    table.index(['name'], 'idx_templates_name');
    table.index(['is_active'], 'idx_templates_active');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('email_templates');
};