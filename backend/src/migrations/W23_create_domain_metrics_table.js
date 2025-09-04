exports.up = async function(knex) {
  await knex.schema.createTable('domain_metrics', function (table) {
    table.increments('id').primary();
    table.string('domain').unique().notNullable();
    table.decimal('reputation_score', 3, 2).defaultTo(1.0);
    table.integer('total_emails').defaultTo(0);
    table.integer('successful_deliveries').defaultTo(0);
    table.integer('bounces').defaultTo(0);
    table.integer('complaints').defaultTo(0);
    table.datetime('last_delivery').nullable();
    table.datetime('last_updated').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    table.index('domain');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('domain_metrics');
};
