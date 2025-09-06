exports.up = function(knex) {
  return knex.schema.createTable('automation_steps', table => {
    table.increments('id').primary();
    table.integer('automation_id').notNullable();
    table.integer('step_order').notNullable(); // Order of execution (1, 2, 3, etc.)
    table.string('step_name').notNullable();
    table.enum('step_type', ['email', 'wait', 'condition', 'action', 'webhook']).notNullable();
    table.integer('template_id').nullable(); // For email steps
    table.string('subject_line').nullable(); // Override template subject
    table.text('custom_content').nullable(); // Override template content
    table.integer('wait_duration_hours').nullable(); // For wait steps
    table.enum('wait_unit', ['minutes', 'hours', 'days', 'weeks']).defaultTo('hours');
    table.json('condition_criteria').nullable(); // For conditional logic steps
    table.json('action_config').nullable(); // For action steps (tag, segment, etc.)
    table.string('webhook_url').nullable(); // For webhook steps
    table.json('webhook_payload').nullable(); // Webhook payload template
    table.boolean('is_active').defaultTo(true);
    table.integer('emails_sent').defaultTo(0);
    table.decimal('open_rate', 5, 2).defaultTo(0);
    table.decimal('click_rate', 5, 2).defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('automation_id').references('email_automations.id').onDelete('CASCADE');
    table.foreign('template_id').references('email_templates.id').onDelete('SET NULL');
    table.index(['automation_id', 'step_order']);
    table.index(['step_type']);
    table.unique(['automation_id', 'step_order']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('automation_steps');
};