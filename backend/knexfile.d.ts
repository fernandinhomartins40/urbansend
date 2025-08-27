import { Knex } from 'knex';

interface KnexConfig {
  [key: string]: Knex.Config;
}

declare const config: KnexConfig;
export = config;