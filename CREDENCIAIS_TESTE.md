# Credenciais de Teste

## Super Admin (login dedicado)
- URL: `/super-admin/login`
- Email padrão: `superadmin@ultrazend.com.br`
- Senha padrão (somente local/dev quando `SUPER_ADMIN_PASSWORD` não estiver definida): `SuperAdmin@123`

## Como garantir/criar o superadmin
1. Executar migrações:
   - `cd backend`
   - `npm run migrate:latest`
2. Executar seed:
   - `npm run seed:super-admin`

## Variáveis recomendadas (staging/produção)
- `SUPER_ADMIN_EMAIL`
- `SUPER_ADMIN_NAME`
- `SUPER_ADMIN_PASSWORD`

## Usuário comum (painel SaaS)
- URL: `/login`
- Não existe credencial fixa no repositório.
- Para testes, criar via cadastro com um email de QA.
