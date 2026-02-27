#!/usr/bin/env node

require('dotenv').config();

const { spawnSync } = require('child_process');
const path = require('path');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);
const usePostgres = isPostgresUrl(process.env.DATABASE_URL || '') || (process.env.DB_CLIENT || '').toLowerCase() === 'pg';

const run = (command, args) => {
  const executable = command;
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32'
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
};

try {
  if (usePostgres) {
    console.log('Using PostgreSQL migration strategy via Prisma (db push).');
    run('npx', ['prisma', 'db', 'push', '--schema', path.join('prisma', 'schema.prisma')]);
    run('npx', ['prisma', 'generate', '--schema', path.join('prisma', 'schema.prisma')]);
  } else {
    console.log('Using SQLite migration strategy via Knex.');
    run('node', ['-r', 'dotenv/config', path.join('node_modules', 'knex', 'bin', 'cli.js'), 'migrate:latest']);
  }
} catch (error) {
  console.error('Database migration failed:', error.message);
  process.exit(1);
}
