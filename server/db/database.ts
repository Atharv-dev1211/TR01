import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path setting (can be overridden for testing via process.env.DB_PATH)
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const defaultDbPath = isVercel
  ? '/tmp/queuecraft.db'
  : path.join(process.env.INIT_CWD || process.cwd(), 'queuecraft.db');

const dbPath = process.env.DB_PATH || defaultDbPath;

// Ensure directory exists if needed
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    // Enable Foreign Keys & Write-Ahead Logging for concurrency safety
    dbInstance.pragma('foreign_keys = ON');
    if (!isVercel) {
      dbInstance.pragma('journal_mode = WAL');
    }
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
