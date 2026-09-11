#!/usr/bin/env node

/**
 * ULTRAZEND - Script de Teste Manual de Deliverability
 * 
 * Execute este script para testar a deliverability do ULTRAZEND SMTP Server
 * 
 * Uso:
 *   node scripts/test-deliverability.js [comando] [opções]
 * 
 * Comandos disponíveis:
 *   mail-tester    - Testa deliverability com mail-tester.com
 *   gmail         - Testa headers DKIM/SPF no Gmail
 *   bounce        - Testa bounce handling
 *   performance   - Testa performance de envio
 *   all           - Executa todos os testes
 * 
 * Exemplos:
 *   node scripts/test-deliverability.js mail-tester test-abc123@mail-tester.com
 *   node scripts/test-deliverability.js gmail seuemail@gmail.com
 *   node scripts/test-deliverability.js bounce
 *   node scripts/test-deliverability.js performance teste@seudoemnio.com 10
 *   node scripts/test-deliverability.js all --gmail=teste@gmail.com --performance=teste@dominio.com
 */

const { config } = require('dotenv');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '../.env') });

// Import test functions
const {
  testMailTesterDeliverability,
  testGmailDeliverability,  
  testBounceHandling,
  testPerformance,
  runAllManualTests
} = require('../dist/__tests__/manual-deliverability.test.js');

const args = process.argv.slice(2);
const command = args[0];

// Helper function to display usage
const showUsage = () => {
  console.log(`
🚀 ULTRAZEND - Test de Deliverability

COMANDOS DISPONÍVEIS:
  mail-tester <email>     - Testa com mail-tester.com
  gmail <email>          - Testa headers no Gmail  
  bounce                 - Testa bounce handling
  performance <email> [n] - Testa performance (n emails, padrão: 5)
  all [opções]           - Executa todos os testes

EXEMPLOS:
  node scripts/test-deliverability.js mail-tester test-abc123@mail-tester.com
  node scripts/test-deliverability.js gmail seuemail@gmail.com
  node scripts/test-deliverability.js bounce
  node scripts/test-deliverability.js performance teste@dominio.com 10
  node scripts/test-deliverability.js all --gmail=teste@gmail.com

CONFIGURAÇÃO:
  Certifique-se de que as variáveis estejam definidas no .env:
  - API_BASE_URL (padrão: http://localhost:3001)
  - TEST_API_KEY (sua chave de API para testes)
  - SMTP_HOSTNAME (ex: www.velomail.com.br)
`);
};

// Main execution
const main = async () => {
  console.log('🚀 ULTRAZEND SMTP Server - Teste de Deliverability\n');
  
  if (!command) {
    showUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'mail-tester':
        if (!args[1]) {
          console.error('❌ Email do mail-tester.com é obrigatório');
          console.log('   Acesse https://www.mail-tester.com/ para obter o endereço de teste');
          process.exit(1);
        }
        await testMailTesterDeliverability(args[1]);
        break;

      case 'gmail':
        if (!args[1]) {
          console.error('❌ Email do Gmail é obrigatório');
          process.exit(1);
        }
        await testGmailDeliverability(args[1]);
        break;

      case 'bounce':
        await testBounceHandling();
        break;

      case 'performance':
        if (!args[1]) {
          console.error('❌ Email para teste de performance é obrigatório');
          process.exit(1);
        }
        const count = parseInt(args[2]) || 5;
        await testPerformance(args[1], count);
        break;

      case 'all':
        const config = {};
        
        // Parse options from command line
        args.slice(1).forEach(arg => {
          if (arg.startsWith('--gmail=')) {
            config.gmailEmail = arg.split('=')[1];
          } else if (arg.startsWith('--mail-tester=')) {
            config.mailTesterEmail = arg.split('=')[1];
          } else if (arg.startsWith('--performance=')) {
            config.performanceEmail = arg.split('=')[1];
          } else if (arg.startsWith('--count=')) {
            config.performanceCount = parseInt(arg.split('=')[1]);
          }
        });
        
        if (!config.gmailEmail && !config.mailTesterEmail && !config.performanceEmail) {
          console.log('⚠️ Executando apenas teste de bounce (nenhum email fornecido)');
          console.log('   Para testes completos, use: --gmail=email@gmail.com --performance=email@dominio.com');
        }
        
        await runAllManualTests(config);
        break;

      default:
        console.error(`❌ Comando desconhecido: ${command}`);
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erro durante a execução:', error.message);
    process.exit(1);
  }
};

// Verificar variáveis de ambiente essenciais
if (!process.env.TEST_API_KEY) {
  console.warn('⚠️ Aviso: TEST_API_KEY não definida no .env');
  console.log('   Defina uma chave de API válida para executar os testes');
}

if (!process.env.SMTP_HOSTNAME) {
  console.warn('⚠️ Aviso: SMTP_HOSTNAME não definida no .env');
  console.log('   Usando www.velomail.com.br como padrão');
}

main().catch(console.error);