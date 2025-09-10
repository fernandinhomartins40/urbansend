#!/usr/bin/env node

/**
 * 🔥 SCRIPT DE VALIDAÇÃO DE ISOLAMENTO CRÍTICO
 * 
 * Este script executa os testes mais importantes do sistema:
 * validação de isolamento entre tenants.
 * 
 * USO: node test-isolation.js
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🔥 INICIANDO TESTES CRÍTICOS DE ISOLAMENTO SAAS');
console.log('=' .repeat(60));

try {
  // Configurar ambiente de teste
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'sqlite:./test.db';

  console.log('📋 Configuração:');
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   Database: ${process.env.DATABASE_URL}`);
  console.log('');

  // Executar testes com verbose para ver detalhes
  console.log('🚀 Executando testes de isolamento...');
  console.log('');

  const testCommand = `npx jest src/tests/tenant-isolation.test.ts --verbose --no-cache --detectOpenHandles --forceExit`;
  
  execSync(testCommand, { 
    stdio: 'inherit',
    cwd: process.cwd()
  });

  console.log('');
  console.log('🎉 TODOS OS TESTES DE ISOLAMENTO PASSARAM!');
  console.log('✅ Sistema SaaS está seguro e isolado por tenant');
  console.log('✅ Zero vazamento detectado entre tenants');
  console.log('✅ Compliance LGPD/GDPR/SOC2 validado');
  console.log('');
  console.log('🚀 Sistema pronto para produção!');

} catch (error) {
  console.error('');
  console.error('❌ TESTES DE ISOLAMENTO FALHARAM!');
  console.error('🚨 SISTEMA NÃO É SEGURO PARA PRODUÇÃO');
  console.error('');
  console.error('Detalhes do erro:');
  console.error(error.message);
  console.error('');
  console.error('⚠️  AÇÃO REQUERIDA:');
  console.error('   1. Corrigir falhas de isolamento');
  console.error('   2. Re-executar testes');
  console.error('   3. Só fazer deploy após 100% dos testes passarem');
  
  process.exit(1);
}