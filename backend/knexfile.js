const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'ultrazend.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/migrations')
    },
    pool: {
      min: 1,    // ← CORRIGIDO: SQLite single connection
      max: 1,    // ← CORRIGIDO: SQLite single connection
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
        conn.run('PRAGMA journal_mode = WAL', cb);
        conn.run('PRAGMA synchronous = NORMAL', cb);
        conn.run('PRAGMA cache_size = 2000', cb);
        conn.run('PRAGMA temp_store = memory', cb);
      }
    }
  },

  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/migrations')
    },
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
      }
    }
  },

  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DATABASE_URL || path.join(__dirname, 'ultrazend.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/migrations'),
      tableName: 'knex_migrations'
    },
    pool: {
      min: 1,
      max: 1, // SQLite single connection for data integrity
      acquireTimeoutMillis: 120000, // 2 minutes for 66 migrations
      createTimeoutMillis: 60000, // Extended for migrations
      destroyTimeoutMillis: 10000,
      idleTimeoutMillis: 300000, // 5 minutes
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
      afterCreate: (conn, cb) => {
        // Essential PRAGMA settings only (optimized for migrations)
        const queries = [
          'PRAGMA foreign_keys = ON',
          'PRAGMA journal_mode = WAL',
          'PRAGMA synchronous = NORMAL',
          'PRAGMA cache_size = -32000' // 32MB cache
        ];
        
        let completed = 0;
        queries.forEach(query => {
          conn.run(query, (err) => {
            if (err) console.warn(`PRAGMA warning: ${query} - ${err.message}`);
            if (++completed === queries.length) cb();
          });
        });
      }
    },
    // Performance settings
    asyncStackTraces: false,
    debug: false
  }
};