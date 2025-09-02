# UltraZend Database Schema Analysis

Baseado na análise do código fonte, as seguintes tabelas são esperadas pelo sistema:

## Tabelas Core (Essenciais)
1. **users** - Usuários do sistema
2. **api_keys** - Chaves de API para autenticação
3. **emails** - Log de emails enviados
4. **email_templates** - Templates de emails
5. **domains** - Domínios configurados
6. **webhooks** - Configurações de webhook

## Tabelas de Analytics e Monitoramento
7. **email_analytics** - Estatísticas de emails (opens, clicks)
8. **request_metrics** - Métricas de performance da API
9. **audit_logs** - Logs de auditoria

## Tabelas de Configuração SMTP/DKIM
10. **dkim_keys** - Chaves DKIM para domínios
11. **dkim_settings** - Configurações DKIM

## Tabelas de Reputação e Supressão
12. **suppression_lists** - Listas de supressão de emails
13. **reputation_metrics** - Métricas de reputação
14. **reputation_history** - Histórico de reputação

## Tabelas de Queue e Jobs
15. **queue_job_failures** - Falhas de jobs na queue
16. **batch_email_stats** - Estatísticas de batch de emails

## Tabelas de Sistema
17. **system_config** - Configurações do sistema
18. **knex_migrations** - Controle de migrations

## Colunas Principais por Tabela (baseado no código)

### users
- id, name, email, password, email_verified, created_at, updated_at

### api_keys
- id, user_id, name, key_hash, permissions, is_active, created_at, updated_at

### emails
- id, user_id, api_key_id, to_email, from_email, subject, html_content, text_content, status, sent_at, created_at, updated_at

### email_analytics
- id, email_id, event_type, tracking_id, user_agent, ip_address, created_at

### domains
- id, user_id, domain, is_verified, verification_token, dkim_enabled, created_at, updated_at

### webhooks
- id, user_id, url, events, is_active, created_at, updated_at

### dkim_keys
- id, domain_id, selector, private_key, public_key, algorithm, canonicalization, key_size, created_at, updated_at

E outras conforme o código...