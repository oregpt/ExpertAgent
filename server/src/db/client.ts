/**
 * Database Client — Conditional Export
 *
 * Desktop mode (IS_DESKTOP=true):  better-sqlite3 + drizzle
 * Cloud mode   (default):          node-postgres (pg) + drizzle
 */

const IS_DESKTOP = process.env.IS_DESKTOP === 'true';

let db: any;

if (IS_DESKTOP) {
  const sqliteClient = require('./client-sqlite');
  db = sqliteClient.db;
} else {
  const { drizzle } = require('drizzle-orm/node-postgres');
  const { Pool } = require('pg');
  const { loadConfig } = require('../config/appConfig');
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.databaseUrl });
  db = drizzle(pool);
}

export { db };
