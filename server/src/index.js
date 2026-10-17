import dotenv from 'dotenv';
import app from './app.js';
import pool from './db/connection.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  try {
    // Verify database connection
    const res = await pool.query('SELECT NOW() AS current_time');
    console.log(`🔌 PostgreSQL connected successfully at ${res.rows[0].current_time}`);

    app.listen(PORT, () => {
      console.log(`🚀 MetalWorks ERP API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
