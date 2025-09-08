exports.up = async function(knex) {
  await knex.schema.createTable('email_quarantine', function (table) {
    table.increments('id').primary();
    table.string('message_id', 255).unique();
    table.string('from_address', 255).notNullable();
    table.string('to_address', 255).notNullable();
    table.string('subject', 500);
    table.text('reason').notNullable();
    table.string('severity', 20).defaultTo('medium');
    table.text('email_content', 'longtext');
    table.json('headers');
    table.json('security_details');
    table.boolean('reviewed').defaultTo(false);
    table.string('action_taken', 50);
    table.timestamp('quarantined_at').defaultTo(knex.fn.now());
    table.timestamp('reviewed_at');
    table.timestamps(true, true);
    
    table.index('quarantined_at');
    table.index('reviewed');
    table.index('severity');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('email_quarantine');
};
