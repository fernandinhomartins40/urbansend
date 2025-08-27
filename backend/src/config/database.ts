import knex from 'knex';
import knexConfig from '../../knexfile';
import { Env } from '../utils/env';

const environment = Env.get('NODE_ENV', 'development');
const config = knexConfig[environment as keyof typeof knexConfig];

if (!config) {
  throw new Error(`No database configuration found for environment: ${environment}`);
}

const db = knex(config);

export default db;