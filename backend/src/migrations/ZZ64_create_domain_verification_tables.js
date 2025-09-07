/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema
        .createTable('domain_verification_logs', function(table) {
            table.increments('id').primary();
            table.integer('domain_id').notNullable();
            table.string('domain_name', 255).notNullable();
            table.integer('user_id').nullable();
            table.string('verification_token', 255).nullable();
            table.json('attempts').notNullable(); // JSON com detalhes das tentativas
            table.enum('overall_status', ['verified', 'failed', 'partial', 'pending']).notNullable();
            table.timestamp('start_time').notNullable();
            table.timestamp('end_time').nullable();
            table.integer('total_duration').nullable(); // em milliseconds
            table.integer('retry_count').defaultTo(0);
            table.boolean('is_automated').defaultTo(false);
            table.string('job_id', 100).nullable();
            table.text('error_summary').nullable();
            table.timestamps(true, true);

            // Índices para performance
            table.index(['domain_id', 'start_time']);
            table.index(['overall_status', 'start_time']);
            table.index('job_id');
            table.index(['is_automated', 'start_time']);
            table.index('domain_name');
        })
        .createTable('domain_verification_metrics', function(table) {
            table.increments('id').primary();
            table.date('metric_date').notNullable();
            table.integer('total_attempts').defaultTo(0);
            table.integer('successful_verifications').defaultTo(0);
            table.integer('failed_verifications').defaultTo(0);
            table.integer('partial_verifications').defaultTo(0);
            table.decimal('average_verification_time', 10, 2).nullable(); // em segundos
            table.json('common_errors').nullable(); // Top erros do dia
            table.json('hourly_distribution').nullable(); // Distribuição por hora
            table.json('retry_statistics').nullable(); // Estatísticas de retry
            table.timestamps(true, true);

            table.unique('metric_date');
            table.index('metric_date');
        });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('domain_verification_metrics')
        .dropTableIfExists('domain_verification_logs');
};