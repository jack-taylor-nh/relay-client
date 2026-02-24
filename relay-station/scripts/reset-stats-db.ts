/**
 * Reset Stats Database
 * 
 * Deletes the existing stats.db file so it can be recreated with the latest schema.
 * Run this when database migrations change.
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Need to mock app for script execution
const userDataPath = process.env.APPDATA || path.join(process.env.HOME || process.env.USERPROFILE || '', 'AppData', 'Roaming');
const appName = 'relay-llm-bridge';
const statsDbPath = path.join(userDataPath, appName, 'stats.db');

console.log('[Reset] Looking for stats database at:', statsDbPath);

if (fs.existsSync(statsDbPath)) {
  fs.unlinkSync(statsDbPath);
  console.log('[Reset] ✅ Deleted old stats.db');
  
  // Also delete WAL files if they exist
  const walPath = `${statsDbPath}-wal`;
  const shmPath = `${statsDbPath}-shm`;
  
  if (fs.existsSync(walPath)) {
    fs.unlinkSync(walPath);
    console.log('[Reset] ✅ Deleted stats.db-wal');
  }
  
  if (fs.existsSync(shmPath)) {
    fs.unlinkSync(shmPath);
    console.log('[Reset] ✅ Deleted stats.db-shm');
  }
  
  console.log('[Reset] Database will be recreated on next app start');
} else {
  console.log('[Reset] No existing database found - nothing to delete');
}
