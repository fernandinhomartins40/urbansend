exports.up = function(knex) {
  return knex.schema.createTable('automation_logs', table => {
    table.increments('id').primary();
    table.integer('automation_execution_id').notNullable();
    table.integer('step_id').nullable();
    table.enum('action_type', ['step_started', 'email_sent', 'email_opened', 'email_clicked', 'wait_started', 'wait_completed', 'condition_evaluated', 'webhook_called', 'execution_failed', 'execution_completed']).notNullable();
    table.enum('status', ['success', 'failed', 'skipped']).notNullable();
    table.text('message').nullable();
    table.json('metadata').nullable(); // Additional data about the action
    table.string('email_id').nullable(); // If action resulted in email being sent
    table.timestamp('executed_at').defaultTo(knex.fn.now());
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.foreign('automation_execution_id').references('automation_executions.id').onDelete('CASCADE');
    table.foreign('step_id').references('automation_steps.id').onDelete('SET NULL');
    table.index(['automation_execution_id']);
    table.index(['step_id']);
    table.index(['action_type']);
    table.index(['executed_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('automation_logs');
};