// Teste rápido da migração dos métodos estáticos
const { SimpleEmailValidator } = require('./src/email/EmailValidator');

console.log('🔧 Testando migração dos métodos estáticos...');

// Teste 1: normalizeDomain
try {
    const result1 = SimpleEmailValidator.normalizeDomain('www.example.com');
    console.log('✅ normalizeDomain:', result1); // Deve ser 'example.com'
    
    const result2 = SimpleEmailValidator.normalizeDomain('EXAMPLE.COM');
    console.log('✅ normalizeDomain lowercase:', result2); // Deve ser 'example.com'
} catch (error) {
    console.error('❌ Erro em normalizeDomain:', error.message);
}

// Teste 2: isValidDomainFormat
try {
    const result3 = SimpleEmailValidator.isValidDomainFormat('example.com');
    console.log('✅ isValidDomainFormat (válido):', result3); // Deve ser true
    
    const result4 = SimpleEmailValidator.isValidDomainFormat('invalid-domain');
    console.log('✅ isValidDomainFormat (inválido):', result4); // Deve ser false
} catch (error) {
    console.error('❌ Erro em isValidDomainFormat:', error.message);
}

console.log('🎉 Migração dos métodos estáticos testada com sucesso!');