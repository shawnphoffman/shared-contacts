import 'dotenv/config';
import { closePool } from './db';
import { syncDbToRadicale, syncRadicaleToDb, startWatchingRadicale, startPeriodicSync } from './sync';
import { startApiServer, setMigrationsComplete } from './api';
import { runMigrations } from './migrations';

async function main() {
  console.log('Starting Shared Contacts Sync Service...');
  console.log(`RADICALE_STORAGE_PATH: ${process.env.RADICALE_STORAGE_PATH}`);
  console.log(`SYNC_INTERVAL: ${process.env.SYNC_INTERVAL || '5000'}ms`);

  try {
    // Start API server first (so health checks work)
    startApiServer();

    // Run database migrations to ensure schema is up to date
    await runMigrations();
    
    // Mark migrations as complete (enables /ready endpoint)
    setMigrationsComplete();

    // Initial sync: Radicale → DB (in case there are existing contacts)
    console.log('Performing initial sync...');
    await syncRadicaleToDb();

    // Initial sync: DB → Radicale (to ensure consistency)
    await syncDbToRadicale();

    // Start watching Radicale for changes
    startWatchingRadicale();

    // Start periodic sync from DB to Radicale
    startPeriodicSync();

    console.log('Sync service started successfully');

    // Keep the process alive
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      await closePool();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      await closePool();
      process.exit(0);
    });
  } catch (error) {
    console.error('Fatal error:', error);
    await closePool();
    process.exit(1);
  }
}

main();

