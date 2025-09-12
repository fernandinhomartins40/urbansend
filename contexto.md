● 📋 PLANO DETALHADO: MIGRAÇÃO ROTA EMAIL V1 → V2

  SITUAÇÃO ATUAL

  - ❌ Rota Legacy: /api/emails/send - Sem multi-tenancy, insegura
  - ❌ Rota V2: /api/emails-v2/send-v2 - Com bugs, desabilitada
  - ❌ Frontend: Usa rota legacy via feature flags desabilitadas
  - ❌ Multi-tenancy: Quebrado (qualquer usuário envia de qualquer domínio)

  ---
  FASE 1: CORREÇÃO DA ROTA V2 🔧

  1.1 Corrigir Bug na Verificação de Domínio

  Problema: EmailValidator consulta tabela user_domains (vazia) ao invés de domains
  // ATUAL (ERRADO):
  const domainRecord = await db('user_domains')
    .where('user_id', userId)
    .where('domain', domain.toLowerCase())

  // CORRETO (DEVE SER):
  const domainRecord = await db('domains')
    .where('user_id', userId)
    .where('domain_name', domain.toLowerCase())
    .where('is_verified', true)

  1.2 Ajustar Schema da Consulta

  - Alterar campo domain → domain_name
  - Alterar campo verified → is_verified
  - Garantir join correto com tabela domains

  1.3 Testes da Correção

  - Testar com domínio verificado (digiurban.com.br)
  - Testar com domínio não verificado
  - Testar com usuário sem domínios

  ---
  FASE 2: MIGRAÇÃO DO FRONTEND 🎯

  2.1 Habilitar Feature Flags

  // frontend/src/config/features.ts
  export const defaultFeatureFlags: FeatureFlags = {
    USER_IN_ROLLOUT: true,        // ← Habilitar
    USE_INTEGRATED_EMAIL_SEND: true,  // ← Habilitar
  }

  2.2 Verificar Componentes Frontend

  - ✅ SendEmail.tsx → Deve automaticamente usar useSmartEmailSend()
  - ✅ useSmartEmailSend() → Deve detectar flags e usar rota V2
  - ✅ useEmailSendV2 → Deve funcionar com rota /api/emails-v2/send-v2

  2.3 Ajustar Formato de Dados

  Garantir compatibilidade entre:
  - Rota V1: to: string
  - Rota V2: to: string[]

  ---
  FASE 3: TESTES INTEGRADOS ✅

  3.1 Cenários de Teste

  1. Usuário com domínio verificado → Deve enviar
  2. Usuário com domínio não verificado → Deve rejeitar
  3. Usuário sem domínios → Deve rejeitar
  4. Domínio interno (@ultrazend.com.br) → Deve permitir

  3.2 Testes de API

  # Teste 1: Domínio verificado (deve funcionar)
  curl -X POST /api/emails-v2/send-v2 \
    -d '{"from":"fernando@digiurban.com.br", "to":["test@example.com"]}'

  # Teste 2: Domínio não verificado (deve rejeitar)
  curl -X POST /api/emails-v2/send-v2 \
    -d '{"from":"fernando@outrodominio.com", "to":["test@example.com"]}'

  ---
  FASE 4: REMOÇÃO DA ROTA LEGACY 🗑️

  4.1 Backup de Segurança

  - Commit atual do sistema
  - Export das filas de email pendentes
  - Backup da configuração atual

  4.2 Remoção Gradual

  1. Comentar rota /api/emails/send em routes/emails.ts
  2. Manter endpoint mas retornar erro de depreciação
  3. Testar que aplicação funciona apenas com V2
  4. Remover completamente após confirmação

  4.3 Limpeza de Código

  - Remover imports não utilizados
  - Remover middleware legacy
  - Atualizar documentação da API

  ---
  FASE 5: VALIDAÇÃO FINAL 🚀

  5.1 Testes End-to-End

  - Login no frontend
  - Envio de email via interface
  - Verificação de entrega
  - Teste de rejeição para domínios não autorizados

  5.2 Monitoramento

  - Logs de erro na rota V2
  - Métricas de emails enviados/rejeitados
  - Performance de verificação de domínios

  5.3 Rollback Plan

  # Se algo der errado:
  1. Restaurar feature flags para false
  2. Reabilitar rota legacy
  3. Revert commits da migração

  ---
  CRONOGRAMA ESTIMADO

  - Fase 1: 30 minutos (correção de bug simples)
  - Fase 2: 15 minutos (alteração de flags)
  - Fase 3: 45 minutos (testes completos)
  - Fase 4: 30 minutos (remoção cuidadosa)
  - Fase 5: 30 minutos (validação final)

  Total: ~2h30min para migração completa e segura

  ---
  RISCOS IDENTIFICADOS ⚠️

  1. Alto: Emails podem parar de funcionar temporariamente
  2. Médio: Usuários podem perder acesso a domínios não verificados
  3. Baixo: Performance pode ser impactada pela verificação adicional

  BENEFITS ESPERADOS ✨

  1. Segurança: Multi-tenancy adequado implementado
  2. Compliance: Usuários só enviam de domínios próprios
  3. Arquitetura: Código limpo, sem duplicação de rotas
  4. Manutenibilidade: Uma única rota de email, bem estruturada

  ---
  Aguardando suas instruções para proceder com a migração.