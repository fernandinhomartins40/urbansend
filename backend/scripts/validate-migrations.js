#!/usr/bin/env node
/**
 * Script para validar migrations do UltraZend SMTP
 * Uso: npm run validate:migrations
 */

const MigrationValidator = require('../src/migrations/tests/migration-validator');

async function main() {
    console.log('🛡️ UltraZend SMTP - Validador de Migrations\n');
    
    const validator = new MigrationValidator();
    const success = await validator.validateAll();
    
    if (success) {
        console.log('\n🎉 Todas as validações passaram! Migrations estão íntegras.');
    } else {
        console.log('\n💥 Validações falharam! Corrija os erros antes de prosseguir.');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Erro no validador:', error);
        process.exit(1);
    });
}

module.exports = main;