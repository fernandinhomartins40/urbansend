exports.up = function(knex) {
  return knex.schema.createTable('automation_executions', table => {
    table.increments('id').primary();
    table.integer('automation_id').notNullable();
    table.integer('contact_id').notNullable();
    table.integer('current_step_id').nullable(); // Which step is next to execute
    table.enum('status', ['active', 'completed', 'paused', 'failed', 'cancelled']).defaultTo('active');
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('next_execution_at').nullable(); // When next step should run
    table.timestamp('completed_at').nullable();
    table.json('execution_context').nullable(); // Variables and data for this execution
    table.text('failure_reason').nullable();
    table.integer('steps_completed').defaultTo(0);
    table.integer('emails_sent').defaultTo(0);
    table.timestamp('last_activity_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('automation_id').references('email_automations.id').onDelete('CASCADE');
    table.foreign('contact_id').references('contacts.id').onDelete('CASCADE');
    table.foreign('current_step_id').references('automation_steps.id').onDelete('SET NULL');
    table.index(['automation_id', 'status']);
    table.index(['contact_id']);
    table.index(['next_execution_at']);
    table.index(['status', 'next_execution_at']);
    table.unique(['automation_id', 'contact_id']); // Each contact can only be in automation once
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('automation_executions');
};