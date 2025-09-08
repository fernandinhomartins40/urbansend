exports.up = function(knex) {
  return knex.schema.createTable('ab_tests', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable();
    table.integer('campaign_id').nullable();
    table.string('test_name').notNullable();
    table.text('description').nullable();
    table.enum('test_type', ['subject_line', 'content', 'send_time', 'from_name', 'template']).notNullable();
    table.enum('status', ['draft', 'running', 'completed', 'paused', 'cancelled']).defaultTo('draft');
    table.integer('sample_size_percentage').defaultTo(50); // Percentage of audience to test
    table.integer('winner_threshold_percentage').defaultTo(95); // Confidence level to declare winner
    table.timestamp('test_start_time').nullable();
    table.timestamp('test_end_time').nullable();
    table.integer('test_duration_hours').defaultTo(24); // How long to run test
    table.string('winning_variant_id').nullable();
    table.json('test_criteria').nullable(); // What metrics to optimize for (open_rate, click_rate, etc.)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table.foreign('campaign_id').references('campaigns.id').onDelete('CASCADE');
    table.index(['user_id', 'status']);
    table.index(['campaign_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('ab_tests');
};