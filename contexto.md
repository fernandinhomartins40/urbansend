  🎯 PLANO DE CORREÇÃO DETALHADO

✻ Thinking…

  Agora vou criar o plano de correção detalhado com as ações específicas necessárias para resolver todos os problemas identificados.

● 🔧 FASE 1: CORREÇÃO CRÍTICA - VERIFICAÇÃO DNS REAL

  1.1 Remover Auto-Verificação Falsa

  Arquivo: dkimManager.ts:708
  // ❌ REMOVER:
  is_verified: true, // Assumir como verificado para domínio principal

  // ✅ SUBSTITUIR POR:
  is_verified: false, // Deve passar por verificação DNS real

  1.2 Implementar Verificação Obrigatória do Domínio Principal

  Arquivo: DomainSetupService.ts
  // Adicionar método para verificar ultrazend.com.br no startup
  async ensureMainDomainVerification() {
    const result = await this.verifyDomainSetup(1, 'ultrazend.com.br');
    if (!result.all_passed) {
      throw new Error('CRÍTICO: Domínio principal não verificado');
    }
  }

  ---
  🔧 FASE 2: CORREÇÃO DE DKIM POR DOMÍNIO

  2.1 Corrigir Geração de Chaves DKIM por Domínio

  Arquivo: MultiDomainDKIMManager.ts
  async generateDKIMConfigForDomain(domain: string): Promise<DKIMConfig | null> {
    // ✅ IMPLEMENTAR: Gerar chaves específicas por domínio
    // ✅ IMPLEMENTAR: Validar se domínio está verificado ANTES de gerar chaves
    // ✅ IMPLEMENTAR: Salvar chaves na tabela dkim_keys com domain_id
  }

  2.2 Bloquear DKIM para Domínios Não Verificados

  Arquivo: DomainValidator.ts
  // ✅ ADICIONAR validação:
  if (domainRecord && domainRecord.is_verified) {
    return {
      email: fromEmail,
      dkimDomain: domain, // ✅ Usar domínio real
      valid: true
    };
  } else {
    // ✅ FORÇAR fallback se não verificado
    return this.createFallbackSender(userId, 'Domain not verified');
  }

  ---
  🔧 FASE 3: VALIDAÇÃO CONSISTENTE

  3.1 Sincronizar Frontend/Backend

  Arquivo: useUserDomains.ts
  // ✅ ADICIONAR verificação dupla:
  select: (data) => ({
    ...data,
    data: {
      ...data.data,
      domains: data.data?.domains?.filter((domain: UserDomain) =>
        domain.is_verified && domain.dns_valid // ✅ Verificar DNS também
      ) || []
    }
  })

  3.2 Implementar DNS Health Check

  Novo arquivo: DomainHealthChecker.ts
  // ✅ CRIAR serviço para re-verificar domínios periodicamente
  // ✅ MARCAR como not-verified se DNS parar de funcionar
  // ✅ ALERTAR usuários sobre problemas de DNS

  ---
  🔧 FASE 4: MONITORAMENTO E AUDITORIA

  4.1 Log Detalhado de DKIM

  Arquivo: ExternalEmailService.ts
  // ✅ ADICIONAR logs detalhados:
  logger.info('DKIM configuration applied', {
    emailId,
    fromDomain: extractDomain(emailData.from),
    dkimDomain: validatedSender.dkimDomain,
    wasForced: validatedSender.fallback,
    configFound: !!dkimConfig
  });

  4.2 Dashboard de Monitoramento

  Frontend: Nova seção em Domains.tsx
  // ✅ IMPLEMENTAR:
  - Status DKIM por domínio
  - Alertas de configuração
  - Teste de envio DKIM

  ---
  ⚡ IMPLEMENTAÇÃO PRIORITÁRIA

  🚨 CRÍTICO (Implementar AGORA):

  1. ✅ Remover is_verified: true automático do domínio principal
  2. ✅ Validar DNS do ultrazend.com.br antes de usar
  3. ✅ Bloquear DKIM para domínios não verificados

  🔥 ALTA PRIORIDADE (Próximas 24h):

  1. ✅ Implementar DKIM por domínio específico
  2. ✅ Sincronizar validação frontend/backend
  3. ✅ Adicionar logs detalhados de DKIM

  📊 MÉDIA PRIORIDADE (Esta semana):

  1. ✅ Health checker automático
  2. ✅ Dashboard de monitoramento
  3. ✅ Alertas proativos

  ---
  🎯 RESULTADO ESPERADO

  Após implementação completa:

  ✅ Domínios só aparecem como verificados se DNS real estiver configurado✅ DKIM usa chaves específicas do domínio do usuário✅ Fallback        
  automático para ultrazend.com.br apenas quando necessário✅ Consistência total entre frontend e backend✅ Monitoramento proativo de 
  problemas DNS

  Status: 🔄 Aguardando aprovação para implementação

> Pense. Implemente 100% do plano de correções

✻ Thinking…

  O usuário quer que eu implemente 100% do plano de correções que identifiquei na auditoria. Vou implementar sistematicamente cada uma das 
  correções críticas identificadas:

  1. FASE 1: Correção crítica - verificação DNS real
  2. FASE 2: Correção de DKIM por domínio 
  3. FASE 3: Validação consistente
  4. FASE 4: Monitoramento e auditoria

  Vou começar pelas correções críticas e depois partir para as outras.

✻ Thinking…

  Vou começar a implementar o plano de correções. Primeiro preciso:
  
  1. FASE 1.1: Remover a auto-verificação falsa do domínio principal no dkimManager.ts
  2. FASE 1.2: Implementar verificação obrigatória do domínio principal
  3. FASE 2.1: Corrigir geração de chaves DKIM por domínio
  4. FASE 2.2: Bloquear DKIM para domínios não verificados
  5. FASE 3.1: Sincronizar Frontend/Backend
  6. FASE 3.2: Implementar DNS Health Check
  7. FASE 4.1: Log detalhado de DKIM
  8. FASE 4.2: Dashboard de monitoramento

  Vou começar com as correções críticas.

● 🚀 IMPLEMENTANDO 100% DO PLANO DE CORREÇÕES

  🔧 FASE 1.1: Remover Auto-Verificação Falsa

● Update(backend\src\services\dkimManager.ts)
  ⎿  Updated backend\src\services\dkimManager.ts with 1 addition and 1 removal
       705            user_id: userId,
       706            domain_name: domain,
       707            verification_token: generateVerificationToken(),
       708 -          is_verified: true, // Assumir como verificado para domínio principal
       708 +          is_verified: false, // Deve passar por verificação DNS real - CORREÇÃO CRÍTICA
       709            verification_method: 'manual',
       710            dkim_enabled: true,
       711            spf_enabled: true,

✻ Thinking…

  Ótimo, implementei a primeira correção crítica. Agora vou para a FASE 1.2 - implementar verificação obrigatória do domínio principal. Vou criar
   um método no DomainSetupService para garantir que o domínio principal seja verificado.

● Update(backend\src\services\DomainSetupService.ts)
  ⎿  Updated backend\src\services\DomainSetupService.ts with 65 additions
       311      }
       312    
       313      /**
       314 +     * Garante que o domínio principal esteja verificado
       315 +     * CORREÇÃO CRÍTICA: Validação obrigatória do domínio principal
       316 +     * 
       317 +     * @returns Promise<boolean> - true se verificado, false caso contrário
       318 +     */
       319 +    async ensureMainDomainVerification(): Promise<boolean> {
       320 +      try {
       321 +        const mainDomain = 'ultrazend.com.br';
       322 +        logger.info('🔧 CORREÇÃO CRÍTICA: Verificando domínio principal obrigatoriamente', {
       323 +          domain: mainDomain
       324 +        });
       325 +  
       326 +        // Buscar usuário sistema ou admin para o domínio principal
       327 +        const systemUser = await db('users')
       328 +          .where('email', 'like', '%ultrazend.com.br')
       329 +          .orWhere('is_admin', true)
       330 +          .first();
       331 +  
       332 +        if (!systemUser) {
       333 +          logger.error('❌ CRÍTICO: Usuário sistema não encontrado para domínio principal');
       334 +          return false;
       335 +        }
       336 +  
       337 +        // Buscar domínio principal
       338 +        const mainDomainRecord = await db('domains')
       339 +          .where('domain_name', mainDomain)
       340 +          .where('user_id', systemUser.id)
       341 +          .first();
       342 +  
       343 +        if (!mainDomainRecord) {
       344 +          logger.error('❌ CRÍTICO: Registro do domínio principal não encontrado');
       345 +          return false;
       346 +        }
       347 +  
       348 +        // Se já está verificado, validar se DNS ainda funciona
       349 +        if (mainDomainRecord.is_verified) {
       350 +          logger.info('🔍 Revalidando domínio principal já verificado');
       351 +          const revalidation = await this.verifyDomainSetup(systemUser.id, mainDomainRecord.id);
       352 +          return revalidation.all_passed;
       353 +        }
       354 +  
       355 +        // Se não verificado, fazer verificação completa
       356 +        logger.info('⚡ Verificando domínio principal pela primeira vez');
       357 +        const verification = await this.verifyDomainSetup(systemUser.id, mainDomainRecord.id);
       358 +  
       359 +        if (!verification.all_passed) {
       360 +          logger.error('❌ CRÍTICO: Domínio principal falhou na verificação DNS', {
       361 +            domain: mainDomain,
       362 +            results: verification.results
       363 +          });
       364 +          return false;
       365 +        }
       366 +  
       367 +        logger.info('✅ SUCESSO: Domínio principal verificado com sucesso');
       368 +        return true;
       369 +  
       370 +      } catch (error) {
       371 +        logger.error('❌ ERRO CRÍTICO: Falha na verificação do domínio principal', {
       372 +          error: error instanceof Error ? error.message : String(error)
       373 +        });
       374 +        return false;
       375 +      }
       376 +    }
       377 +  
       378 +    /**
       379       * Obtém o status de todos os domínios de um usuário
       380       *
       381       * @param userId - ID do usuário

✻ Thinking…

  Agora vou para a FASE 2.1: Corrigir geração de DKIM por domínio. Preciso modificar o MultiDomainDKIMManager para gerar chaves específicas por 
  domínio e validar se o domínio está verificado antes de gerar as chaves.

● 🔧 FASE 2.1: Corrigir Geração DKIM por Domínio

● Read(backend\src\services\MultiDomainDKIMManager.ts)
  ⎿  Read 23 lines (ctrl+r to expand)

✻ Thinking…

  Preciso encontrar o método generateDKIMConfigForDomain no MultiDomainDKIMManager. Vou buscar por ele.

● Search(pattern: "generateDKIMConfigForDomain", path: "backend\src\services\MultiDomainDKIMManager.ts", output_mode: "content")
  ⎿  Found 53 lines (ctrl+r to expand)

✻ Thinking…

  Agora vou modificar o método generateDKIMConfigForDomain para incluir a validação se o domínio está verificado antes de gerar chaves DKIM.

● Update(backend\src\services\MultiDomainDKIMManager.ts)
  ⎿  Updated backend\src\services\MultiDomainDKIMManager.ts with 17 additions and 1 removal
       142       */
       143      private async generateDKIMConfigForDomain(domain: string): Promise<DKIMConfig | null> {
       144        try {
       145 -        // Verificar se o domínio existe na tabela domains e está verificado
       145 +        // 🔧 CORREÇÃO CRÍTICA: Verificar se o domínio existe na tabela domains e está VERIFICADO
       146          const domainRecord = await db('domains')
       147            .select('*')
       148            .where('domain_name', domain)
     ...
       155            return null;
       156          }
       157
       158 +        // 🚨 CRÍTICO: Só gerar DKIM para domínios VERIFICADOS
       159 +        if (!domainRecord.is_verified) {
       160 +          logger.warn('🔒 DKIM generation blocked: Domain not verified', { 
       161 +            domain,
       162 +            domainId: domainRecord.id,
       163 +            isVerified: domainRecord.is_verified
       164 +          });
       165 +          return null; // Não gerar DKIM para domínios não verificados
       166 +        }
       167 +  
       168 +        logger.info('✅ Domain verified, proceeding with DKIM generation', {
       169 +          domain,
       170 +          domainId: domainRecord.id,
       171 +          verifiedAt: domainRecord.verified_at
       172 +        });
       173 +  
       174          // Verificar se já existe configuração DKIM (pode estar inativa)
       175          const existingKey = await db('dkim_keys')
       176            .where('domain_id', domainRecord.id)

✻ Thinking…

  Agora vou implementar a FASE 2.2: Bloquear DKIM para domínios não verificados. Preciso modificar o DomainValidator para ser mais rigoroso e só 
  usar o domínio real se estiver efetivamente verificado.

● 🔧 FASE 2.2: Bloquear DKIM para Domínios Não Verificados

● Update(backend\src\services\DomainValidator.ts)
  ⎿  Updated backend\src\services\DomainValidator.ts with 21 additions and 4 removals
        87            };
        88          }
        89    
        90 -        // 3. Verificar propriedade e verificação do domínio pelo usuário
        90 +        // 3. 🔧 CORREÇÃO CRÍTICA: Verificar propriedade E verificação RIGOROSA do domínio
        91          const domainRecord = await this.checkDomainOwnership(userId, domain);
        92    
        93          if (domainRecord && domainRecord.is_verified) {
        94 -          logger.debug('Verified domain found for user', { 
        94 +          logger.info('✅ DKIM autorizado: Domain verified and owned by user', { 
        95              userId,
        96              domain,
        97 -            domainId: domainRecord.id 
        97 +            domainId: domainRecord.id,
        98 +            verifiedAt: domainRecord.verified_at
        99            });
       100
       101            return {
       102              email: fromEmail,
       103 -            dkimDomain: domain,
       103 +            dkimDomain: domain, // ✅ Usar domínio real verificado
       104              valid: true
       105            };
       106          }
       107
       108 +        // 🚨 CRÍTICO: Log detalhado para domínios rejeitados
       109 +        if (domainRecord && !domainRecord.is_verified) {
       110 +          logger.warn('🔒 DKIM bloqueado: Domain owned but NOT VERIFIED', {
       111 +            userId,
       112 +            domain,
       113 +            domainId: domainRecord.id,
       114 +            isVerified: domainRecord.is_verified,
       115 +            createdAt: domainRecord.created_at
       116 +          });
       117 +        } else if (!domainRecord) {
       118 +          logger.warn('🔒 DKIM bloqueado: Domain NOT OWNED by user', {
       119 +            userId,
       120 +            domain
       121 +          });
       122 +        }
       123 +  
       124          // 4. Domínio não verificado ou não pertence ao usuário - aplicar fallback
       125          const reason = domainRecord ? 'Domain not verified' : 'Domain not owned';
       126

✻ Thinking…

  Agora vou implementar a FASE 3: Sincronizar frontend/backend. Preciso modificar o hook useUserDomains para também verificar o status de DNS 
  válido.

● 🔧 FASE 3.1: Sincronizar Frontend/Backend

● Update(frontend\src\hooks\useUserDomains.ts)
  ⎿  Updated frontend\src\hooks\useUserDomains.ts with 16 additions and 2 removals
       64        staleTime: 5 * 60 * 1000,
       65        cacheTime: 15 * 60 * 1000,
       66        select: (data) => {
       67 -        // Filtrar apenas domínios verificados no frontend também
       67 +        // 🔧 CORREÇÃO CRÍTICA: Filtrar domínios com verificação rigorosa
       68          return {
       69            ...data,
       70            data: {
       71              ...data.data,
       72 -            domains: data.data?.domains?.filter((domain: UserDomain) => domain.is_verified) || []
       72 +            domains: data.data?.domains?.filter((domain: UserDomain) => {
       73 +              // Verificação dupla: is_verified E status verificado
       74 +              const isFullyVerified = domain.is_verified && 
       75 +                                     domain.verification_status === 'verified';
       76 +
       77 +              if (!isFullyVerified) {
       78 +                console.warn('🔒 Domain filtered out: not fully verified', {
       79 +                  domain: domain.domain_name,
       80 +                  is_verified: domain.is_verified,
       81 +                  verification_status: domain.verification_status
       82 +                });
       83 +              }
       84 +
       85 +              return isFullyVerified;
       86 +            }) || []
       87            }
       88          }
       89        },

✻ Thinking…

  Agora vou implementar a FASE 3.2: DNS Health Check. Vou criar um serviço para verificar periodicamente os domínios e marcar como não 
  verificados se o DNS parar de funcionar.

● 🔧 FASE 3.2: Implementar DNS Health Check

● Write(backend\src\services\DomainHealthChecker.ts)
  ⎿  Wrote 1 lines to backend\src\services\DomainHealthChecker.ts
     import { logger } from '../config/logger';
     import db from '../config/database';
     import { DomainSetupService } from './DomainSetupService';
     import { AlertingService } from './AlertingService';
     export interface DomainHealthStatus {
       domainId: number;
       domainName: string;
       userId: number;
       wasVerified: boolean;