/**
 * Garantir que todas as tabelas críticas do sistema existam
 * Esta migration é defensiva e só cria se não existir
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    console.log('🛡️ Ensuring all critical tables exist...');
    
    try {
        // Lista de tabelas críticas que devem existir
        const criticalTables = [
            {
                name: 'users',
                create: (table) => {
                    table.increments('id').primary();
                    table.string('email', 255).notNullable().unique();
                    table.string('name', 255).notNullable();
                    table.string('password', 255).notNullable();
                    table.boolean('is_verified').defaultTo(false); // SEMPRE is_verified
                    table.string('role', 50).defaultTo('user');
                    table.boolean('is_active').defaultTo(true);
                    table.timestamps(true, true);
                }
            },
            {
                name: 'emails',
                create: (table) => {
                    table.increments('id').primary();
                    table.string('sender_email', 255).notNullable();
                    table.string('recipient_email', 255).notNullable();
                    table.string('subject', 500);
                    table.text('html_content', 'longtext');
                    table.text('text_content', 'longtext');
                    table.string('status', 50).defaultTo('queued');
                    table.timestamp('sent_at').nullable();
                    table.timestamps(true, true);
                }
            },
            {
                name: 'processed_emails',
                create: (table) => {
                    table.increments('id').primary();
                    table.string('message_id', 255).unique();
                    table.string('from_address', 255).notNullable();
                    table.string('to_address', 255).notNullable();
                    table.string('subject', 500);
                    table.string('direction', 20).notNullable(); // 'incoming', 'outgoing'
                    table.string('status', 50).notNullable(); // 'delivered', 'queued', 'rejected'
                    table.text('rejection_reason');
                    table.timestamp('processed_at').defaultTo(knex.fn.now());
                    table.timestamps(true, true);
                }
            }
        ];
        
        // Verificar e criar tabelas se não existirem
        for (const tableConfig of criticalTables) {
            const exists = await knex.schema.hasTable(tableConfig.name);
            if (!exists) {
                await knex.schema.createTable(tableConfig.name, tableConfig.create);
                console.log(`✅ Created missing table: ${tableConfig.name}`);
            } else {
                console.log(`ℹ️ Table ${tableConfig.name} already exists`);
            }
        }
        
        console.log('🎉 All critical tables verified/created');
        
    } catch (error) {
        console.error('❌ Error ensuring critical tables:', error);
        throw error;
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    console.log('⚠️ Rollback not implemented for critical tables (safety)');
    // Não implementar down para não apagar tabelas críticas acidentalmente
};