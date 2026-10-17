import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const poolConfig = {
  user: process.env.DB_USER || 'ron',
  password: process.env.DB_PASSWORD || undefined,
  database: process.env.DB_NAME || 'metalworks_erp',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Check if socket path is specified or standard unix socket host
if (process.env.DB_HOST && process.env.DB_HOST.startsWith('/')) {
  poolConfig.host = process.env.DB_HOST;
} else {
  poolConfig.host = process.env.DB_HOST || '127.0.0.1';
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Execute a series of queries within a transaction
 * @param {Function} callback - Function receiving the client: async (client) => { ... }
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
