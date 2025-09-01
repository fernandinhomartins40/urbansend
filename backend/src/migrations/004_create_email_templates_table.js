exports.up = function(knex) {
  return knex.schema.createTable('email_templates', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    table.string('template_name', 100).notNullable();
    table.string('subject', 255).notNullable();
    table.text('html_content').nullable();
    table.text('text_content').nullable();
    table.text('variables').nullable(); // JSON array
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for performance
    table.index(['user_id']);
    table.index(['template_name']);
    table.index(['created_at']);
    
    // Unique constraint per user
    table.unique(['user_id', 'template_name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_templates');
};