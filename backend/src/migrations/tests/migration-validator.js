/**
 * Validador de Migrations - UltraZend SMTP
 * Testa consistência e integridade das migrations
 */

const fs = require('fs');
const path = require('path');

class MigrationValidator {
    constructor(migrationsDir = path.join(__dirname, '..')) {
        this.migrationsDir = migrationsDir;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Executa todos os testes de validação
     */
    async validateAll() {
        console.log('🔍 Iniciando validação das migrations...\n');
        
        await this.testNamingConvention();
        await this.testAlphabeticalOrder();
        await this.testDuplicates();
        await this.testRequiredStructure();
        await this.testSchemaConsistency();
        
        this.printResults();
        return this.errors.length === 0;
    }

    /**
     * Testa convenção de nomenclatura A01, B02, C03...
     */
    async testNamingConvention() {
        const files = this.getMigrationFiles();
        const pattern = /^[A-Z]\d{2}_[a-z_]+\.js$/;
        
        console.log('📋 Testando convenção de nomenclatura...');
        
        files.forEach(file => {
            if (!pattern.test(file)) {
                this.errors.push(`❌ Nome inválido: ${file} (esperado: A01_exemplo.js)`);
            }
        });
        
        if (this.errors.length === 0) {
            console.log('✅ Convenção de nomenclatura OK\n');
        }
    }

    /**
     * Testa ordem alfabética
     */
    async testAlphabeticalOrder() {
        const files = this.getMigrationFiles();
        const sortedFiles = [...files].sort();
        
        console.log('🔤 Testando ordem alfabética...');
        
        for (let i = 0; i < files.length; i++) {
            if (files[i] !== sortedFiles[i]) {
                this.errors.push(`❌ Ordem incorreta: ${files[i]} deveria vir após ${sortedFiles[i]}`);
            }
        }
        
        if (this.errors.length === 0) {
            console.log('✅ Ordem alfabética OK\n');
        }
    }

    /**
     * Testa duplicatas
     */
    async testDuplicates() {
        const files = this.getMigrationFiles();
        const prefixes = files.map(f => f.substring(0, 3));
        const duplicates = prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index);
        
        console.log('🔍 Testando duplicatas...');
        
        if (duplicates.length > 0) {
            this.errors.push(`❌ Prefixos duplicados: ${[...new Set(duplicates)].join(', ')}`);
        } else {
            console.log('✅ Sem duplicatas\n');
        }
    }

    /**
     * Testa estrutura obrigatória
     */
    async testRequiredStructure() {
        const files = this.getMigrationFiles();
        
        console.log('🏗️ Testando estrutura das migrations...');
        
        for (const file of files) {
            const filePath = path.join(this.migrationsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            if (!content.includes('exports.up')) {
                this.errors.push(`❌ ${file}: Falta função exports.up`);
            }
            
            if (!content.includes('exports.down')) {
                this.errors.push(`❌ ${file}: Falta função exports.down`);
            }
            
            if (!content.includes('knex')) {
                this.errors.push(`❌ ${file}: Não utiliza knex`);
            }
        }
        
        if (this.errors.length === 0) {
            console.log('✅ Estrutura das migrations OK\n');
        }
    }

    /**
     * Testa consistência de schema
     */
    async testSchemaConsistency() {
        console.log('🔧 Testando consistência de schema...');
        
        // Verificar se A01 usa is_verified (não email_verified)
        const a01Path = path.join(this.migrationsDir, 'A01_create_users_table.js');
        if (fs.existsSync(a01Path)) {
            const content = fs.readFileSync(a01Path, 'utf8');
            
            if (content.includes('email_verified')) {
                this.errors.push('❌ A01: Ainda usa email_verified (deveria ser is_verified)');
            } else if (content.includes('is_verified')) {
                console.log('✅ A01 usa is_verified corretamente');
            }
            
            if (!content.includes('role')) {
                this.warnings.push('⚠️ A01: Tabela users pode precisar da coluna role');
            }
            
            if (!content.includes('is_active')) {
                this.warnings.push('⚠️ A01: Tabela users pode precisar da coluna is_active');
            }
        }
        
        console.log('✅ Consistência de schema verificada\n');
    }

    /**
     * Obtém lista de arquivos de migration
     */
    getMigrationFiles() {
        return fs.readdirSync(this.migrationsDir)
            .filter(file => file.endsWith('.js') && !file.includes('test'))
            .sort();
    }

    /**
     * Imprime resultados
     */
    printResults() {
        console.log('📊 RESULTADO DA VALIDAÇÃO:');
        console.log('═'.repeat(50));
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('🎉 TODAS AS VALIDAÇÕES PASSARAM!');
        } else {
            if (this.errors.length > 0) {
                console.log('\n❌ ERROS ENCONTRADOS:');
                this.errors.forEach(error => console.log(`   ${error}`));
            }
            
            if (this.warnings.length > 0) {
                console.log('\n⚠️ AVISOS:');
                this.warnings.forEach(warning => console.log(`   ${warning}`));
            }
        }
        
        console.log('\n' + '═'.repeat(50));
        console.log(`✅ Migrations válidas: ${this.getMigrationFiles().length}`);
        console.log(`❌ Erros: ${this.errors.length}`);
        console.log(`⚠️ Avisos: ${this.warnings.length}`);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const validator = new MigrationValidator();
    validator.validateAll().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = MigrationValidator;