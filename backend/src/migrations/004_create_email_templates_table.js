exports.up = function(knex) {
  return knex.schema.createTable('email_templates', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('template_name').notNullable();
    table.string('subject').notNullable();
    table.text('html_content').nullable();
    table.text('text_content').nullable();
    table.text('variables').nullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id', 'template_name']);
    table.index(['user_id']);
    table.index(['template_name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_templates');
};