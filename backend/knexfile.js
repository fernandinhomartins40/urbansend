const path = require('path');

const migrationsDir = path.join(__dirname, 'src/migrations');

const isPostgresUrl = (value = '') => /^postgres(ql)?:\/\//i.test(value);

const shouldUsePostgres = () => {
  if ((process.env.DB_CLIENT || '').toLowerCase() === 'pg') {
    return true;
  }

  return isPostgresUrl(process.env.DATABASE_URL || '');
};

const buildSqliteConfig = (filename) => ({
  client: 'sqlite3',
  connection: { filename },
  useNullAsDefault: true,
  migrations: {
    directory: migrationsDir,
    tableName: 'knex_migrations'
  },
  pool: {
    min: 1,
    max: 1,
    acquireTimeoutMillis: 120000,
    createTimeoutMillis: 60000,
    destroyTimeoutMillis: 10000,
    idleTimeoutMillis: 300000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
    propagateCreateError: false,
    afterCreate: (conn, cb) => {
      const queries = [
        'PRAGMA foreign_keys = ON',
        'PRAGMA journal_mode = WAL',
        'PRAGMA synchronous = NORMAL',
        'PRAGMA cache_size = -32000'
      ];

      let completed = 0;
      queries.forEach((query) => {
        conn.run(query, (err) => {
          if (err) {
            // Keep startup resilient on environments with partial PRAGMA support.
            // eslint-disable-next-line no-console
            console.warn(`PRAGMA warning: ${query} - ${err.message}`);
          }
          if (++completed === queries.length) cb();
        });
      });
    }
  },
  asyncStackTraces: false,
  debug: false
});

const buildPostgresConfig = (fallbackDatabaseName) => {
  const urlFromEnv = process.env.DATABASE_URL;
  const defaultUrl = `postgresql://postgres:postgres@127.0.0.1:5432/${fallbackDatabaseName}?schema=public`;

  return {
    client: 'pg',
    connection: urlFromEnv || defaultUrl,
    migrations: {
      directory: migrationsDir,
      tableName: 'knex_migrations'
    },
    pool: {
      // Mantidos os valores originais (min 2 / max 12). Reduzir para max 5 foi
      // testado e NAO e seguro: a inicializacao abre conexoes em varios
      // subsistemas ao mesmo tempo e satura o pool, travando o boot antes do
      // server.listen(). Agora sao ajustaveis por ENV, mas so mude com teste
      // de boot completo (ver docs/VPS-OPTIMIZATION-AUDIT.md).
      min: Number(process.env.DB_POOL_MIN || 2),
      max: Number(process.env.DB_POOL_MAX || 12),
      acquireTimeoutMillis: 120000,
      createTimeoutMillis: 60000,
      destroyTimeoutMillis: 10000,
      idleTimeoutMillis: 300000
    },
    asyncStackTraces: false,
    debug: false
  };
};

const productionDatabaseFile = process.env.DATABASE_URL || path.join(__dirname, 'ultrazend.sqlite');
const testDatabaseFile = process.env.TEST_DATABASE_PATH || ':memory:';
const usePostgres = shouldUsePostgres();

module.exports = {
  development: usePostgres
    ? buildPostgresConfig('ultrazend_dev')
    : buildSqliteConfig(path.join(__dirname, 'ultrazend.sqlite')),

  test: process.env.TEST_DB_CLIENT === 'pg'
    ? buildPostgresConfig('ultrazend_test')
    : buildSqliteConfig(testDatabaseFile),

  production: usePostgres
    ? buildPostgresConfig('ultrazend')
    : buildSqliteConfig(productionDatabaseFile)
};
