# Operação de segurança e schema

## Rotação de segredos

Sempre que um segredo for exposto, gere novos valores fora do repositório e atualize o ambiente antes de reiniciar a aplicação. Em produção, estes valores são obrigatórios e distintos:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `APP_ENCRYPTION_KEY`
- credenciais de banco, SMTP, DKIM e integrações

Depois do rollout, invalide sessões e API keys quando aplicável, gere novas chaves DKIM e remova o valor antigo do cofre. Nunca registre valores, URLs com credenciais, cookies ou chaves privadas no Git.

## Fonte de verdade do banco

Knex é a fonte de verdade para mudanças de schema executáveis. Toda alteração deve:

1. Adicionar uma migration incremental em `backend/src/migrations`.
2. Atualizar `backend/prisma/schema.prisma` e `backend/prisma/schema.sqlite.prisma` como representação validada.
3. Executar a migration em ambiente efêmero e `prisma validate` para ambos os schemas afetados.
4. Não usar `prisma db push` como substituto de migration versionada.

Essa regra preserva deploys reproduzíveis em SQLite e PostgreSQL enquanto o projeto mantém Prisma para client e inspeção de schema.

## Gates obrigatórios

- `node .github/scripts/check-tracked-sensitive-files.mjs`
- `npm audit --omit=dev`
- `npm run typecheck`
- `npm run build`

O workflow `Quality checks` executa esses controles em instalação limpa.
