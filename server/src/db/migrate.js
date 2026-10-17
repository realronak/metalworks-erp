import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { withTransaction } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  console.log('🔄 Starting database migrations...');
  const client = await pool.connect();
  
  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Fetch already applied migrations
    const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.map(r => r.name));

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (!appliedNames.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        await withTransaction(async (txClient) => {
          await txClient.query(sql);
          await txClient.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        });

        console.log(`✅ Applied migration: ${file}`);
        count++;
      }
    }

    if (count === 0) {
      console.log('✨ All migrations are already up to date.');
    } else {
      console.log(`🚀 Successfully applied ${count} migration(s).`);
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    // Do not call pool.end() if called from another script
    if (process.argv[1] === __filename) {
      await pool.end();
    }
  }
}

if (process.argv[1] === __filename) {
  runMigrations();
}

export { runMigrations };
