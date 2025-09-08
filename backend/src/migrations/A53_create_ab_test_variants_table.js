exports.up = function(knex) {
  return knex.schema.createTable('ab_test_variants', table => {
    table.increments('id').primary();
    table.integer('ab_test_id').notNullable();
    table.string('variant_name').notNullable(); // A, B, C, etc.
    table.boolean('is_control').defaultTo(false); // Is this the control variant?
    table.integer('traffic_percentage').notNullable(); // What % of traffic gets this variant
    
    // Variant content based on test type
    table.string('subject_line').nullable();
    table.text('email_content').nullable();
    table.string('from_name').nullable();
    table.string('from_email').nullable();
    table.integer('template_id').nullable();
    table.json('send_time_config').nullable(); // For send time optimization
    table.json('variant_config').nullable(); // Additional config specific to variant
    
    // Metrics tracking
    table.integer('emails_sent').defaultTo(0);
    table.integer('emails_delivered').defaultTo(0);
    table.integer('emails_opened').defaultTo(0);
    table.integer('emails_clicked').defaultTo(0);
    table.integer('emails_bounced').defaultTo(0);
    table.integer('unsubscribes').defaultTo(0);
    table.integer('spam_reports').defaultTo(0);
    
    // Calculated rates (updated by background job)
    table.decimal('delivery_rate', 5, 2).defaultTo(0);
    table.decimal('open_rate', 5, 2).defaultTo(0);
    table.decimal('click_rate', 5, 2).defaultTo(0);
    table.decimal('bounce_rate', 5, 2).defaultTo(0);
    table.decimal('unsubscribe_rate', 5, 2).defaultTo(0);
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('ab_test_id').references('ab_tests.id').onDelete('CASCADE');
    table.foreign('template_id').references('email_templates.id').onDelete('SET NULL');
    table.index(['ab_test_id']);
    table.unique(['ab_test_id', 'variant_name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('ab_test_variants');
};