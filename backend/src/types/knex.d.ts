import { Knex } from 'knex';

declare module '../../knexfile' {
  interface KnexConfig {
    development: Knex.Config;
    staging?: Knex.Config;
    production: Knex.Config;
  }
  
  const config: KnexConfig;
  export = config;
}