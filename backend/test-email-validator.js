/**
 * 🧪 TESTE FASE 2.2 - EmailValidator Integration
 * Teste isolado da validação de domínio conforme PLANO_INTEGRACAO_SEGURA.md
 */

const { SimpleEmailValidator } = require('./dist/email/EmailValidator');
const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './ultrazend.sqlite'
  },
  useNullAsDefault: true
});

async function testEmailValidatorIntegration() {
  console.log('🧪 FASE 2.2 - Testando EmailValidator integrado\n');
  
  try {
    // Criar instância do EmailValidator
    const validator = new SimpleEmailValidator();
    console.log('✅ SimpleEmailValidator instanciado com sucesso');
    
    // Teste 1: Domínio não verificado
    console.log('\n📋 Teste 1: Domínio não verificado');
    const result1 = await validator.checkDomainOwnership('example.com', 1);
    console.log('Resultado:', JSON.stringify(result1, null, 2));
    console.log(`Verificado: ${result1.verified} ${result1.verified ? '✅' : '❌'}`);
    
    // Teste 2: Criar um domínio verificado para teste
    console.log('\n📋 Teste 2: Adicionando domínio verificado de teste');
    await knex('user_domains').insert({
      user_id: 999,
      domain: 'test-domain.com',
      verified: true,
      verified_at: new Date(),
      verification_method: 'fase2-test',
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('✅ Domínio test-domain.com adicionado para usuário 999');
    
    // Teste 3: Domínio verificado
    console.log('\n📋 Teste 3: Testando domínio verificado');
    const result2 = await validator.checkDomainOwnership('test-domain.com', 999);
    console.log('Resultado:', JSON.stringify(result2, null, 2));
    console.log(`Verificado: ${result2.verified} ${result2.verified ? '✅' : '❌'}`);
    console.log(`VerifiedAt: ${result2.verifiedAt ? result2.verifiedAt : 'N/A'}`);
    
    // Teste 4: Domínio interno (deve ser permitido)
    console.log('\n📋 Teste 4: Testando domínio interno');
    const internalTest = {
      from: 'test@ultrazend.com.br',
      to: 'recipient@example.com',
      subject: 'Test Internal Domain'
    };
    const result3 = await validator.validate(internalTest, 999);
    console.log('Resultado:', JSON.stringify(result3, null, 2));
    console.log(`Válido: ${result3.valid} ${result3.valid ? '✅' : '❌'}`);
    
    // Teste 5: Domínio não verificado com fallback
    console.log('\n📋 Teste 5: Testando fallback para domínio não verificado');
    const externalTest = {
      from: 'user@external-domain.com',
      to: 'recipient@example.com',
      subject: 'Test External Domain'
    };
    const result4 = await validator.validate(externalTest, 999);
    console.log('Resultado:', JSON.stringify(result4, null, 2));
    console.log(`Válido: ${result4.valid} ${result4.valid ? '✅' : '❌'}`);
    console.log(`From original: ${externalTest.from}`);
    console.log(`From fallback: ${result4.email?.from || 'N/A'}`);
    
    // Limpar dados de teste
    console.log('\n🧹 Limpando dados de teste');
    await knex('user_domains').where('verification_method', 'fase2-test').del();
    console.log('✅ Dados de teste removidos');
    
    // Verificar critérios de sucesso da Fase 2.2
    console.log('\n🎯 FASE 2.2 - CRITÉRIOS DE SUCESSO:');
    console.log(result1.verified === false ? '✅ Retorna verified: false para domínios não verificados' : '❌ FALHOU: verified deveria ser false');
    console.log(result2.verified === true ? '✅ Retorna verified: true para domínios verificados' : '❌ FALHOU: verified deveria ser true');
    console.log(result2.verifiedAt ? '✅ Retorna verifiedAt quando verificado' : '❌ FALHOU: verifiedAt deveria existir');
    console.log(result3.valid === true ? '✅ Permite domínios internos' : '❌ FALHOU: domínios internos deveriam ser permitidos');
    console.log(result4.valid === true && result4.email?.from?.includes('ultrazend.com.br') ? '✅ Aplica fallback corretamente' : '❌ FALHOU: fallback não aplicado');
    
    const allTestsPassed = 
      result1.verified === false &&
      result2.verified === true &&
      result2.verifiedAt &&
      result3.valid === true &&
      result4.valid === true && result4.email?.from?.includes('ultrazend.com.br');
    
    console.log(`\n🎯 RESULTADO FINAL FASE 2.2: ${allTestsPassed ? '✅ TODOS OS TESTES PASSARAM' : '❌ ALGUNS TESTES FALHARAM'}`);
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await knex.destroy();
  }
}

testEmailValidatorIntegration();