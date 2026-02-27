#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const knex = require('knex');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);

const sqliteUrlFromEnv = process.env.SQLITE_DATABASE_URL || process.env.SQLITE_PATH;
const sqliteFile = sqliteUrlFromEnv || path.join(__dirname, '..', 'ultrazend.sqlite');
const postgresUrl = process.env.DATABASE_URL || '';

if (!isPostgresUrl(postgresUrl)) {
  console.error('DATABASE_URL must be a PostgreSQL URL for this script.');
  process.exit(1);
}

const source = knex({
  client: 'sqlite3',
  connection: {
    filename: sqliteFile
  },
  useNullAsDefault: true
});

const target = knex({
  client: 'pg',
  connection: postgresUrl,
  pool: { min: 1, max: 4 }
});

const BATCH_SIZE = Number(process.env.COPY_BATCH_SIZE || 1000);

const chunks = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const getSourceTables = async () => {
  const rows = await source('sqlite_master')
    .select('name')
    .where('type', 'table')
    .whereNotLike('name', 'sqlite_%')
    .orderBy('name', 'asc');

  return rows
    .map((row) => row.name)
    .filter((name) => name && name !== 'knex_migrations_lock');
};

const copyTable = async (tableName) => {
  const exists = await target.schema.hasTable(tableName);
  if (!exists) {
    console.warn(`Skipping ${tableName}: table not found in PostgreSQL.`);
    return { tableName, copied: 0, skipped: true };
  }

  const rows = await source(tableName).select('*');
  await target.raw(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);

  if (rows.length === 0) {
    return { tableName, copied: 0, skipped: false };
  }

  for (const batch of chunks(rows, BATCH_SIZE)) {
    await target(tableName).insert(batch);
  }

  return { tableName, copied: rows.length, skipped: false };
};

(async () => {
  let replicationRoleReplica = false;

  try {
    console.log(`SQLite source: ${sqliteFile}`);
    console.log('PostgreSQL target: configured via DATABASE_URL');

    const tables = await getSourceTables();
    console.log(`Found ${tables.length} tables in source database.`);

    try {
      await target.raw('SET session_replication_role = replica');
      replicationRoleReplica = true;
      console.log('PostgreSQL FK checks temporarily relaxed (session_replication_role=replica).');
    } catch (error) {
      console.warn('Could not set session_replication_role=replica. Continuing with standard FK checks.');
    }

    let copiedRows = 0;
    let copiedTables = 0;

    for (const tableName of tables) {
      const result = await copyTable(tableName);
      if (!result.skipped) {
        copiedTables += 1;
        copiedRows += result.copied;
      }
      console.log(
        result.skipped
          ? `- ${tableName}: skipped`
          : `- ${tableName}: ${result.copied} rows`
      );
    }

    console.log(`Done. ${copiedTables} tables processed, ${copiedRows} rows copied.`);
  } catch (error) {
    console.error('SQLite -> PostgreSQL copy failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (replicationRoleReplica) {
      try {
        await target.raw('SET session_replication_role = DEFAULT');
      } catch (error) {
        console.warn('Failed to restore session_replication_role.');
      }
    }

    await Promise.allSettled([source.destroy(), target.destroy()]);
  }
})();
