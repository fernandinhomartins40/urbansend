/**
 * Migration para corrigir inconsistências da coluna email_verified vs is_verified
 * Esta migration garante que apenas is_verified exista e funcione corretamente
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    console.log('🔧 Fixing email_verified consistency...');
    
    try {
        // Verificar se a coluna email_verified ainda existe
        const hasEmailVerified = await knex.schema.hasColumn('users', 'email_verified');
        const hasIsVerified = await knex.schema.hasColumn('users', 'is_verified');
        
        console.log(`📊 Current state: email_verified=${hasEmailVerified}, is_verified=${hasIsVerified}`);
        
        if (hasEmailVerified && !hasIsVerified) {
            // Caso 1: Ainda tem email_verified, precisa renomear
            await knex.schema.alterTable('users', (table) => {
                table.renameColumn('email_verified', 'is_verified');
            });
            console.log('✅ Renamed email_verified to is_verified');
            
        } else if (!hasEmailVerified && !hasIsVerified) {
            // Caso 2: Nenhuma das duas existe, criar is_verified
            await knex.schema.alterTable('users', (table) => {
                table.boolean('is_verified').defaultTo(false);
            });
            console.log('✅ Created is_verified column');
            
        } else if (hasEmailVerified && hasIsVerified) {
            // Caso 3: Ambas existem (problema), manter apenas is_verified
            // Primeiro copiar dados se necessário
            await knex.raw(`
                UPDATE users 
                SET is_verified = COALESCE(is_verified, email_verified, 0)
            `);
            
            await knex.schema.alterTable('users', (table) => {
                table.dropColumn('email_verified');
            });
            console.log('✅ Merged email_verified into is_verified and dropped duplicate');
            
        } else {
            // Caso 4: Só is_verified existe - está correto
            console.log('✅ Column consistency already correct');
        }
        
        console.log('🎉 Email verification column consistency fixed');
        
    } catch (error) {
        console.error('❌ Error fixing email_verified consistency:', error);
        throw error;
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    console.log('⚠️ Rollback for email_verified consistency fix');
    
    try {
        const hasIsVerified = await knex.schema.hasColumn('users', 'is_verified');
        
        if (hasIsVerified) {
            // Reverter para email_verified se necessário
            await knex.schema.alterTable('users', (table) => {
                table.renameColumn('is_verified', 'email_verified');
            });
            console.log('🔙 Rolled back is_verified to email_verified');
        }
    } catch (error) {
        console.error('❌ Error in rollback:', error);
        // Não falhar o rollback se não conseguir desfazer
    }
};