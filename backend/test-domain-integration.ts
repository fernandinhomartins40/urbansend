/**
 * TESTE ISOLADO - Integração EmailValidator com user_domains
 * Fase 2.2 do plano de integração segura
 */

import { SimpleEmailValidator } from './src/email/EmailValidator';
import db from './src/config/database';

async function testDomainIntegration() {
  console.log('🔧 FASE 2.2 - Teste de Integração EmailValidator');
  console.log('='.repeat(50));

  try {
    // Inicializar EmailValidator
    const validator = new SimpleEmailValidator();
    console.log('✅ SimpleEmailValidator criado com sucesso');

    // Teste 1: Domínio não verificado (deve retornar verified: false)
    console.log('\n📋 Teste 1: Domínio não verificado');
    const result1 = await validator.checkDomainOwnership('exemplo-nao-verificado.com', 1);
    console.log('Resultado:', result1);
    
    if (result1.verified === false) {
      console.log('✅ Teste 1 PASSOU: Retornou verified: false para domínio não verificado');
    } else {
      console.log('❌ Teste 1 FALHOU: Deveria retornar verified: false');
    }

    // Teste 2: Verificar se consegue consultar a tabela user_domains
    console.log('\n📋 Teste 2: Consulta à tabela user_domains');
    
    // Inserir um domínio verificado para teste
    const testUserId = 999;
    const testDomain = 'teste-integracao.com';
    
    try {
      // Primeiro, remover se já existe
      await db('user_domains').where('user_id', testUserId).where('domain', testDomain).del();
      
      // Inserir domínio verificado
      await db('user_domains').insert({
        user_id: testUserId,
        domain: testDomain,
        verified: true,
        verified_at: new Date(),
        verification_method: 'test',
        created_at: new Date(),
        updated_at: new Date()
      });
      
      console.log('✅ Domínio de teste inserido na user_domains');
      
      // Testar se o EmailValidator consegue encontrar
      const result2 = await validator.checkDomainOwnership(testDomain, testUserId);
      console.log('Resultado:', result2);
      
      if (result2.verified === true && result2.verifiedAt) {
        console.log('✅ Teste 2 PASSOU: Encontrou domínio verificado com verifiedAt');
      } else {
        console.log('❌ Teste 2 FALHOU: Não encontrou domínio verificado ou verifiedAt ausente');
      }
      
      // Limpar dados de teste
      await db('user_domains').where('user_id', testUserId).where('domain', testDomain).del();
      console.log('✅ Dados de teste limpos');
      
    } catch (error) {
      console.log('❌ Erro ao testar inserção na user_domains:', (error as Error).message);
    }

    // Teste 3: Domínios internos (devem sempre funcionar)
    console.log('\n📋 Teste 3: Domínios internos');
    const internalDomains = ['velomail.com.br', 'mail.velomail.com.br', 'www.velomail.com.br'];
    
    for (const domain of internalDomains) {
      // Para domínios internos, testar através do método validate
      const emailData = { from: `test@${domain}` };
      const validationResult = await validator.validate(emailData, 1);
      
      if (validationResult.valid === true) {
        console.log(`✅ Domínio interno ${domain}: PASSOU`);
      } else {
        console.log(`❌ Domínio interno ${domain}: FALHOU`);
      }
    }

    console.log('\n🎉 Teste de integração concluído!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    // Fechar conexão do banco
    try {
      await db.destroy();
      console.log('✅ Conexão do banco fechada');
    } catch (error) {
      console.log('⚠️ Erro ao fechar conexão:', (error as Error).message);
    }
  }
}

// Executar teste
testDomainIntegration()
  .then(() => {
    console.log('\n✅ Teste de integração finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Teste de integração falhou:', error);
    process.exit(1);
  });