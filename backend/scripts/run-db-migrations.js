#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const { spawnSync } = require('child_process');
const path = require('path');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);
const usePostgres = isPostgresUrl(process.env.DATABASE_URL || '') || (process.env.DB_CLIENT || '').toLowerCase() === 'pg';

const run = (command, args, env) => {
  const executable = command;
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
};

const buildMigrationPlan = (env = process.env) => {
  const usePostgresForPlan = isPostgresUrl(env.DATABASE_URL || '') || (env.DB_CLIENT || '').toLowerCase() === 'pg';

  if (usePostgresForPlan) {
    return [
      ['node', [path.join('scripts', 'prepare-postgres-for-prisma.js')]],
      ['npx', [
        'prisma',
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.join('prisma', 'schema.prisma')
      ]]
    ];
  }

  return [[
    'node',
    ['-r', 'dotenv/config', path.join('node_modules', 'knex', 'bin', 'cli.js'), 'migrate:latest']
  ]];
};

const main = () => {
  const baseEnv = {
    ...process.env,
    DOTENV_CONFIG_QUIET: 'true',
    PRISMA_HIDE_UPDATE_MESSAGE: 'true'
  };

  if (usePostgres) {
    console.log('Using PostgreSQL migration strategy via Prisma (db push without destructive acceptance).');
  } else {
    console.log('Using SQLite migration strategy via Knex.');
  }

  try {
    for (const [command, args] of buildMigrationPlan(baseEnv)) {
      run(command, args, baseEnv);
    }
    // `prisma generate` foi removido intencionalmente: nenhuma linha de src/
    // importa @prisma/client (o runtime usa Knex). Gerar o client em produção
    // gastava CPU/RAM da VPS a cada deploy para produzir um artefato morto.
  } catch (error) {
    console.error('Database migration failed:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}

module.exports = { buildMigrationPlan, isPostgresUrl };
