#!/usr/bin/env node
/**
 * Detecta divergencias entre prisma/schema.prisma e o banco alvo ANTES do deploy.
 *
 * O deploy roda `prisma db push` sem `--accept-data-loss`. Esse comando aborta
 * quando precisaria dropar uma tabela/coluna ausente do schema, ou quando nao
 * consegue comparar um tipo. Descobrir isso no CI custa um deploy quebrado; este
 * script antecipa o diagnostico.
 *
 * Usa `prisma migrate diff`, que apenas imprime o DDL: nada e aplicado.
 *
 * Uso:
 *   node scripts/check-prisma-schema-drift.js
 *   DATABASE_URL=postgresql://... node scripts/check-prisma-schema-drift.js
 *
 * Saida: 0 quando o push passaria, 1 quando ha operacao destrutiva pendente.
 */

require('dotenv').config({ quiet: true });

const { spawnSync } = require('child_process');
const path = require('path');

const SCHEMA_PATH = path.join('prisma', 'schema.prisma');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);

// `DROP TABLE`/`DROP COLUMN` sao os casos que derrubam o deploy. Renomear
// constraint, criar indice ou criar tabela passam sem reclamacao.
const DESTRUCTIVE = /\b(DROP\s+TABLE|DROP\s+COLUMN)\b/i;

const buildDiff = (databaseUrl) => spawnSync(
  'npx',
  [
    'prisma', 'migrate', 'diff',
    '--from-url', databaseUrl,
    '--to-schema-datamodel', SCHEMA_PATH,
    '--script'
  ],
  {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: 'true' }
  }
);

const main = () => {
  const databaseUrl = process.env.DATABASE_URL || '';

  if (!isPostgresUrl(databaseUrl)) {
    console.log('DATABASE_URL nao aponta para PostgreSQL; nada a verificar.');
    console.log('O caminho SQLite usa Knex e nao passa pelo prisma db push.');
    return 0;
  }

  const result = buildDiff(databaseUrl);

  if (result.error) {
    console.error('Falha ao executar prisma migrate diff:', result.error.message);
    return 1;
  }

  if (result.status !== 0) {
    console.error('prisma migrate diff falhou:');
    console.error((result.stderr || '').trim().slice(0, 2000));
    return 1;
  }

  const ddl = result.stdout || '';
  const destructive = ddl
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => DESTRUCTIVE.test(line));

  if (destructive.length) {
    console.error('Divergencia destrutiva entre o schema e o banco:\n');
    destructive.forEach((line) => console.error(`  ${line}`));
    console.error('\nO `prisma db push` do deploy vai abortar nisso.');
    console.error('Cada linha acima e algo que existe no banco e nao esta');
    console.error('declarado em prisma/schema.prisma. Declare o modelo ou a');
    console.error('coluna que falta — nao use --accept-data-loss, que manda');
    console.error('dropar de proposito.');
    return 1;
  }

  const created = ddl.split('\n').filter((line) => /^CREATE TABLE/i.test(line.trim()));
  console.log('Nenhuma operacao destrutiva pendente: o db push passaria.');
  if (created.length) {
    console.log(`Tabelas que seriam criadas: ${created.length}`);
  }
  return 0;
};

if (require.main === module) {
  process.exit(main());
}

module.exports = { DESTRUCTIVE, isPostgresUrl };
