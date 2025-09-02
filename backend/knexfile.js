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
      min: 2,
      max: 15,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 100,
      afterCreate: (conn, cb) => {
        conn.run('PRAGMA foreign_keys = ON', cb);
        conn.run('PRAGMA journal_mode = WAL', cb);
        conn.run('PRAGMA synchronous = NORMAL', cb);
        conn.run('PRAGMA cache_size = 1000', cb);
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
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 300000, // 5 minutes
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
      afterCreate: (conn, cb) => {
        // Production-optimized PRAGMA settings
        const queries = [
          'PRAGMA foreign_keys = ON',
          'PRAGMA journal_mode = WAL',
          'PRAGMA synchronous = NORMAL',
          'PRAGMA cache_size = -64000', // 64MB cache
          'PRAGMA temp_store = memory',
          'PRAGMA mmap_size = 536870912', // 512MB
          'PRAGMA wal_autocheckpoint = 1000',
          'PRAGMA optimize',
          'PRAGMA analysis_limit = 400',
          'PRAGMA threads = 4'
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