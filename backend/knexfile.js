const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, '../data/database.sqlite')
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
      filename: process.env.DATABASE_URL || path.join(__dirname, '../data/database.sqlite')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'src/migrations')
    },
    pool: {
      min: 10,
      max: 50,
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
        conn.run('PRAGMA cache_size = 2000', cb);
        conn.run('PRAGMA temp_store = memory', cb);
        conn.run('PRAGMA mmap_size = 268435456', cb); // 256MB
      }
    }
  }
};