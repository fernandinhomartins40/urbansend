/**
 * ULTRAZEND - Testes Manuais de Deliverability
 * 
 * Este arquivo contém scripts para testes manuais de deliverability.
 * Execute individualmente para testar diferentes cenários.
 * 
 * Este arquivo contém apenas funções exportáveis, não testes Jest diretos.
 */

// Configuração do ambiente de teste
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_API_KEY = process.env.TEST_API_KEY || 'your-test-api-key';

/**
 * Teste 1: Mail-Tester.com Deliverability Test
 * 
 * Este teste envia um email para mail-tester.com para avaliar o score de deliverability.
 * Acesse https://www.mail-tester.com/ para obter o endereço de teste atual.
 */
export const testMailTesterDeliverability = async (testEmailAddress: string) => {
  console.log('🧪 Iniciando teste de deliverability com Mail-Tester.com...');
  
  try {
    const emailData = {
      from: `noreply@${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}`,
      to: testEmailAddress,
      subject: 'ULTRAZEND SMTP Server - Deliverability Test',
      html: `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ULTRAZEND Deliverability Test</title>
          <style>
            body { 
              font-family: 'Inter', sans-serif; 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
              background-color: #f8fafc;
            }
            .container { 
              background: white; 
              padding: 40px; 
              border-radius: 12px; 
              box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #6366f1;
            }
            .content {
              line-height: 1.6;
              color: #374151;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 14px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🚀 ULTRAZEND</div>
              <h1>SMTP Server Deliverability Test</h1>
            </div>
            
            <div class="content">
              <p><strong>Teste de Deliverability - ULTRAZEND SMTP Server</strong></p>
              
              <p>Este email foi enviado para testar a capacidade de entrega do servidor SMTP ULTRAZEND.</p>
              
              <h3>Configurações do Servidor:</h3>
              <ul>
                <li><strong>Servidor:</strong> ${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}</li>
                <li><strong>DKIM:</strong> Habilitado</li>
                <li><strong>SPF:</strong> Configurado</li>
                <li><strong>DMARC:</strong> Ativo</li>
                <li><strong>Timestamp:</strong> ${new Date().toISOString()}</li>
              </ul>
              
              <h3>Recursos Testados:</h3>
              <ul>
                <li>✅ Autenticação DKIM</li>
                <li>✅ Validação SPF</li>
                <li>✅ Política DMARC</li>
                <li>✅ Headers RFC compliant</li>
                <li>✅ Content-Type correto</li>
              </ul>
              
              <p>Se você está vendo este email, o ULTRAZEND SMTP Server está funcionando corretamente!</p>
            </div>
            
            <div class="footer">
              <p>ULTRAZEND - Servidor SMTP Transacional</p>
              <p>Desenvolvido para competir com Resend, Mailgun e SendGrid</p>
              <p><small>Test ID: ${Date.now()}</small></p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
ULTRAZEND SMTP Server - Deliverability Test

Este email foi enviado para testar a capacidade de entrega do servidor SMTP ULTRAZEND.

Configurações do Servidor:
- Servidor: ${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}
- DKIM: Habilitado
- SPF: Configurado  
- DMARC: Ativo
- Timestamp: ${new Date().toISOString()}

Recursos Testados:
✅ Autenticação DKIM
✅ Validação SPF
✅ Política DMARC
✅ Headers RFC compliant
✅ Content-Type correto

Se você está vendo este email, o ULTRAZEND SMTP Server está funcionando corretamente!

ULTRAZEND - Servidor SMTP Transacional
Desenvolvido para competir com Resend, Mailgun e SendGrid
Test ID: ${Date.now()}
      `
    };

    const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Email enviado com sucesso para Mail-Tester!');
      console.log(`📧 Email ID: ${result.id}`);
      console.log(`📬 Destinatário: ${testEmailAddress}`);
      console.log('🔍 Acesse https://www.mail-tester.com/ para ver o resultado do teste');
      return { success: true, emailId: result.id };
    } else {
      console.error('❌ Erro ao enviar email:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    return { success: false, error };
  }
};

/**
 * Teste 2: Gmail Deliverability Test
 * 
 * Testa a entrega para Gmail e verifica headers DKIM/SPF
 */
export const testGmailDeliverability = async (gmailAddress: string) => {
  console.log('📧 Iniciando teste de deliverability com Gmail...');
  
  const emailData = {
    from: `test@${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}`,
    to: gmailAddress,
    subject: 'ULTRAZEND - Teste de Headers DKIM/SPF',
    html: `
      <h2>🔒 Teste de Autenticação de Email</h2>
      <p>Este email testa as seguintes configurações de autenticação:</p>
      <ul>
        <li><strong>DKIM Signature:</strong> Verificar se aparece como "PASS" nos headers</li>
        <li><strong>SPF Authentication:</strong> Verificar se aparece como "PASS"</li>
        <li><strong>DMARC Policy:</strong> Verificar se está sendo aplicada</li>
      </ul>
      <p><em>Para verificar: Gmail → Mostrar Original → Verificar headers de autenticação</em></p>
      <hr>
      <p><small>Enviado via ULTRAZEND SMTP Server em ${new Date().toISOString()}</small></p>
    `,
    text: `ULTRAZEND - Teste de Headers DKIM/SPF\n\nEste email testa as configurações de autenticação.\nPara verificar: Gmail → Mostrar Original → Verificar headers de autenticação\n\nEnviado via ULTRAZEND SMTP Server em ${new Date().toISOString()}`
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Email de teste enviado para Gmail!');
      console.log('📋 Instruções para verificar:');
      console.log('   1. Acesse o Gmail');
      console.log('   2. Abra o email recebido');
      console.log('   3. Clique nos 3 pontos → "Mostrar original"');
      console.log('   4. Procure por: "dkim=pass", "spf=pass", "dmarc=pass"');
      return { success: true, emailId: result.id };
    } else {
      console.error('❌ Erro ao enviar email:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    return { success: false, error };
  }
};

/**
 * Teste 3: Bounce Handling Test
 * 
 * Testa o tratamento de bounces enviando para email inexistente
 */
export const testBounceHandling = async () => {
  console.log('↩️ Iniciando teste de Bounce Handling...');
  
  const nonExistentEmail = `nonexistent-${Date.now()}@invalid-domain-test-${Math.random().toString(36).substring(7)}.com`;
  
  const emailData = {
    from: `bounce-test@${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}`,
    to: nonExistentEmail,
    subject: 'ULTRAZEND - Teste de Bounce',
    html: '<h1>Este email deve fazer bounce</h1><p>Se você está vendo isto, algo deu errado no teste de bounce.</p>',
    text: 'Este email deve fazer bounce. Se você está vendo isto, algo deu errado no teste de bounce.'
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_API_KEY
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Email de bounce enviado!');
      console.log(`📧 Email ID: ${result.id}`);
      console.log(`📫 Destinatário (inexistente): ${nonExistentEmail}`);
      console.log('⏱️ Aguarde alguns minutos e verifique os logs para o bounce...');
      
      return { 
        success: true, 
        emailId: result.id,
        bounceTestEmail: nonExistentEmail 
      };
    } else {
      console.error('❌ Erro ao enviar email de bounce:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('❌ Erro durante o teste de bounce:', error);
    return { success: false, error };
  }
};

/**
 * Teste 4: Performance Test
 * 
 * Testa o envio de múltiplos emails para verificar performance
 */
export const testPerformance = async (testEmail: string, count: number = 5) => {
  console.log(`⚡ Iniciando teste de performance - ${count} emails...`);
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 1; i <= count; i++) {
    try {
      const emailData = {
        from: `perf-test@${process.env.SMTP_HOSTNAME || 'www.ultrazend.com.br'}`,
        to: testEmail,
        subject: `ULTRAZEND Performance Test ${i}/${count}`,
        html: `
          <h2>📊 Teste de Performance #${i}</h2>
          <p>Este é o email ${i} de ${count} no teste de performance.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
          <p>Thread ID: ${Math.random().toString(36).substring(7)}</p>
        `,
        text: `Teste de Performance #${i}\n\nEste é o email ${i} de ${count} no teste de performance.\nTimestamp: ${new Date().toISOString()}`
      };

      const response = await fetch(`${API_BASE_URL}/api/emails/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify(emailData)
      });

      const result = await response.json();
      results.push({
        index: i,
        success: response.ok,
        emailId: result.id,
        timestamp: Date.now()
      });

      console.log(`📤 Email ${i}/${count} enviado - ID: ${result.id}`);
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Erro no email ${i}:`, error);
      results.push({
        index: i,
        success: false,
        error,
        timestamp: Date.now()
      });
    }
  }
  
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const successful = results.filter(r => r.success).length;
  const emailsPerSecond = (successful / (totalTime / 1000)).toFixed(2);
  
  console.log('\n📈 Resultados do Teste de Performance:');
  console.log(`⏱️ Tempo total: ${totalTime}ms`);
  console.log(`✅ Emails enviados: ${successful}/${count}`);
  console.log(`🚀 Taxa: ${emailsPerSecond} emails/segundo`);
  
  return {
    totalTime,
    totalEmails: count,
    successfulEmails: successful,
    emailsPerSecond: parseFloat(emailsPerSecond),
    results
  };
};

// Função utilitária para executar todos os testes
export const runAllManualTests = async (config: {
  mailTesterEmail?: string;
  gmailEmail?: string;
  performanceEmail?: string;
  performanceCount?: number;
}) => {
  console.log('🚀 Executando todos os testes manuais de deliverability...\n');
  
  const results: any = {};
  
  if (config.mailTesterEmail) {
    console.log('1️⃣ Executando teste Mail-Tester...');
    results.mailTester = await testMailTesterDeliverability(config.mailTesterEmail);
    console.log('');
  }
  
  if (config.gmailEmail) {
    console.log('2️⃣ Executando teste Gmail...');
    results.gmail = await testGmailDeliverability(config.gmailEmail);
    console.log('');
  }
  
  console.log('3️⃣ Executando teste Bounce Handling...');
  results.bounce = await testBounceHandling();
  console.log('');
  
  if (config.performanceEmail) {
    console.log('4️⃣ Executando teste Performance...');
    results.performance = await testPerformance(config.performanceEmail, config.performanceCount || 5);
    console.log('');
  }
  
  console.log('✅ Todos os testes manuais concluídos!');
  return results;
};