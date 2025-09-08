exports.up = async function(knex) {
  await knex.schema.createTable('dkim_signature_logs', function (table) {
    table.increments('id').primary();
    table.integer('domain_id').unsigned().notNullable();
    table.string('selector', 100).notNullable();
    table.string('message_id', 255);
    table.string('recipient_domain', 255);
    table.boolean('signature_valid').defaultTo(true);
    table.string('algorithm', 20);
    table.text('signature_hash');
    table.timestamps(true, true);
    
    table.foreign('domain_id').references('id').inTable('domains').onDelete('CASCADE');
    table.index(['domain_id', 'created_at']);
    table.index('signature_valid');
  });
};
exports.down = async function(knex) {
  await knex.schema.dropTable('dkim_signature_logs');
};
