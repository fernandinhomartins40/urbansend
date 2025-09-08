exports.up = function(knex) {
  return knex.schema.createTable('ab_test_results', table => {
    table.increments('id').primary();
    table.integer('ab_test_id').notNullable();
    table.integer('winning_variant_id').nullable();
    table.decimal('confidence_level', 5, 2).defaultTo(0); // Statistical confidence %
    table.boolean('is_statistically_significant').defaultTo(false);
    table.json('statistical_analysis').nullable(); // P-values, confidence intervals, etc.
    table.json('performance_summary').nullable(); // Summary of all variants performance
    table.text('recommendations').nullable(); // AI-generated recommendations
    table.timestamp('analysis_completed_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.foreign('ab_test_id').references('ab_tests.id').onDelete('CASCADE');
    table.foreign('winning_variant_id').references('ab_test_variants.id').onDelete('SET NULL');
    table.index(['ab_test_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('ab_test_results');
};