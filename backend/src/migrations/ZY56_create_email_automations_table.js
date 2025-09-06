exports.up = function(knex) {
  return knex.schema.createTable('email_automations', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.string('automation_name').notNullable();
    table.text('description').nullable();
    table.enum('status', ['draft', 'active', 'paused', 'completed', 'cancelled']).defaultTo('draft');
    table.enum('trigger_type', ['welcome', 'abandoned_cart', 'birthday', 'anniversary', 'behavioral', 'date_based', 'api_trigger']).notNullable();
    table.json('trigger_config').nullable(); // Configuration for trigger conditions
    table.json('audience_criteria').nullable(); // Who receives this automation
    table.integer('total_subscribers').defaultTo(0);
    table.integer('active_subscribers').defaultTo(0);
    table.timestamp('last_triggered_at').nullable();
    table.integer('emails_sent').defaultTo(0);
    table.boolean('is_recurring').defaultTo(true);
    table.integer('max_executions').nullable(); // Null = unlimited
    table.integer('current_executions').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.index(['user_id', 'status']);
    table.index(['trigger_type']);
    table.index(['status', 'is_recurring']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('email_automations');
};