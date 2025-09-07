/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema
        .createTable('metrics', function(table) {
            table.increments('id').primary();
            table.string('name').notNullable();
            table.float('value').notNullable();
            table.json('labels');
            table.timestamp('timestamp').defaultTo(knex.fn.now());
            
            table.index(['name', 'timestamp']);
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTableIfExists('metrics');
};