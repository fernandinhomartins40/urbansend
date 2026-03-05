# Credenciais de Teste

## Super Admin (login dedicado)
- URL: `/super-admin/login`
- Email padrao: `superadmin@ultrazend.com.br`
- Senha atual: `SuperAdmin@123`

## Regras de deploy (producao)
- `SUPER_ADMIN_PASSWORD` nao e mais trocada automaticamente por tamanho no deploy.
- O seed `npm run seed:super-admin` preserva a senha atual por padrao.
- Para rotacionar senha de forma intencional:
  - Defina `SUPER_ADMIN_PASSWORD` com a nova senha.
  - Execute `SUPER_ADMIN_FORCE_PASSWORD_RESET=true npm run seed:super-admin`.

## Como garantir/criar o superadmin
1. Execute migracoes:
   - `cd backend`
   - `npm run migrate:latest`
2. Execute seed:
   - `npm run seed:super-admin`

## Variaveis recomendadas (staging/producao)
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_NAME`
- `SUPER_ADMIN_PASSWORD`
- `SUPER_ADMIN_FORCE_PASSWORD_RESET` (usar somente quando for trocar senha)

## Usuario comum (painel SaaS)
- URL: `/login`
- Nao existe credencial fixa no repositorio.
- Para testes, crie via cadastro com um email de QA.
