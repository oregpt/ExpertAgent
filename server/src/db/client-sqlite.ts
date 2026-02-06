/**
 * SQLite Client for Desktop (Electron) Build
 *
 * Uses better-sqlite3 + drizzle-orm for local embedded database.
 * The database file lives in the user's app data directory.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';

// Determine data directory:
// 1. EXPERT_AGENT_DATA_DIR env var (set by Electron main process)
// 2. Fallback to current directory
const dataDir = process.env.EXPERT_AGENT_DATA_DIR || process.cwd();
const dbPath = path.join(dataDir, 'expert-agent.db');

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

console.log(`[db-sqlite] Opening database at ${dbPath}`);

const sqlite = new Database(dbPath);

// Performance pragmas
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite);

// Expose raw sqlite handle for init.ts to run DDL
export const rawSqlite = sqlite;
