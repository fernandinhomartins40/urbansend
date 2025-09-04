/**
 * Criar usuário do sistema (versão melhorada e defensiva)
 * Usa is_verified e garante que não haverá conflitos
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    console.log('👤 Creating improved system user...');
    
    try {
        // Verificar se usuário sistema já existe
        const existingUser = await knex('users')
            .where('email', 'system@ultrazend.com.br')
            .first();
        
        if (!existingUser) {
            const systemUser = {
                email: 'system@ultrazend.com.br',
                name: 'Sistema UltraZend',
                password: '$2b$12$dummy.hash.for.system.user.that.cannot.login.safely.stored',
                is_verified: true, // SEMPRE is_verified
                role: 'system',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            };
            
            await knex('users').insert(systemUser);
            console.log('✅ System user created successfully');
        } else {
            console.log('ℹ️ System user already exists, ensuring consistency...');
            
            // Garantir que tem is_verified = true
            await knex('users')
                .where('email', 'system@ultrazend.com.br')
                .update({
                    is_verified: true,
                    role: 'system',
                    is_active: true,
                    updated_at: new Date()
                });
            console.log('✅ System user updated for consistency');
        }
    } catch (error) {
        console.error('❌ Error creating/updating system user:', error);
        throw error;
    }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
    console.log('🗑️ Removing system user...');
    await knex('users')
        .where('email', 'system@ultrazend.com.br')
        .del();
    console.log('✅ System user removed');
};