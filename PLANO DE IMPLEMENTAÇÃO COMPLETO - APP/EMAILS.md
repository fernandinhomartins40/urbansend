PLANO DE IMPLEMENTAÇÃO COMPLETO - PÁGINA /APP/EMAILS

  FASE 1: CORREÇÕES NO BANCO DE DADOS

  1.1 - Criar migration para adicionar campo bounce_reason:
  -- Migration: 007_add_bounce_reason_to_emails.js
  ALTER TABLE emails ADD COLUMN bounce_reason TEXT;

  1.2 - Corrigir campo timestamp na tabela email_analytics:
  -- Já existe como 'created_at', apenas ajustar queries

  FASE 2: EXPANSÃO DO BACKEND

  2.1 - Adicionar endpoint /emails/${id}/analytics:
  // backend/src/routes/emails.ts - linha ~107
  router.get('/:id/analytics',
    authenticateJWT,
    validateRequest({ params: idParamSchema }),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const analytics = await db('email_analytics')
        .where('email_id', req.params.id)
        .orderBy('created_at', 'desc');

      res.json({ analytics });
    })
  );

  2.2 - Otimizar endpoint GET /emails com estatísticas:
  // Adicionar agregações SQL para estatísticas em vez de calcular no frontend
  const stats = await db('emails')
    .where('user_id', req.user!.id)
    .select(
      db.raw('COUNT(*) as total'),
      db.raw('SUM(CASE WHEN status = "delivered" THEN 1 ELSE 0 END) as delivered'),
      db.raw('SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened'),
      db.raw('SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicked')
    ).first();

  2.3 - Implementar sistema de tracking:
  // Novos endpoints para tracking
  router.get('/track/open/:trackingId', ...); // Pixel de abertura
  router.get('/track/click/:trackingId', ...); // Links com tracking

  FASE 3: MELHORIAS NO FRONTEND

  3.1 - Implementar página de detalhes do email:
  // frontend/src/pages/EmailDetails.tsx
  export function EmailDetails() {
    // Mostrar email completo + analytics detalhadas
  }

  3.2 - Implementar navegação "Novo Email":
  // frontend/src/pages/SendEmail.tsx
  export function SendEmail() {
    // Formulário para envio de novo email
  }

  3.3 - Otimizar estatísticas (usar dados do backend):
  // Remover cálculos do frontend e usar dados da API
  const stats = data?.stats || { total: 0, delivered: 0, opened: 0, clicked: 0 };

  FASE 4: FUNCIONALIDADES AVANÇADAS

  4.1 - Sistema de Tracking em Tempo Real:
  - Pixel transparente para abertura
  - Proxy para links com tracking
  - WebSocket para updates em tempo real

  4.2 - Filtros Avançados:
  - Filtro por data
  - Filtro por domínio
  - Busca por conteúdo

  4.3 - Ações em Lote:
  - Reenviar emails falhados
  - Marcar como lido/não lido
  - Exportar dados

  PRIORIDADES DE IMPLEMENTAÇÃO:

  🔥 CRÍTICO (Implementar primeiro):
  1. Migration para bounce_reason
  2. Endpoint /emails/${id}/analytics
  3. Página de detalhes do email
  4. Otimização de estatísticas no backend

  ⚠️ IMPORTANTE (Segunda fase):
  1. Página "Novo Email"
  2. Sistema básico de tracking
  3. Melhorias na paginação

  ✨ MELHORIAS (Terceira fase):
  1. Tracking em tempo real
  2. Filtros avançados
  3. Ações em lote

  Estrutura de arquivos alinhada:
  - Frontend: interface Email ← → Backend: emails table
  - Frontend: analytics ← → Backend: email_analytics table
  - Nomenclaturas já estão alinhadas, apenas falta o campo bounce_reason

  O plano garante que todas as funcionalidades da interface tenham persistência adequada no banco e que frontend/backend estejam
  sincronizados.