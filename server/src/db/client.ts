import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config/appConfig';

const config = loadConfig();

const pool = new Pool({
  connectionString: config.databaseUrl,
});

export const db = drizzle(pool);
