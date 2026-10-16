const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  // Let the connection URL (including Neon's sslmode) configure TLS by default.
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  ...(process.env.DB_SSL === 'false' ? { ssl: false } : {}),
  max: 3,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  allowExitOnIdle: true,
});

pool.on('error', (err) => console.error('Database connection error:', err.code || err.name));

module.exports = { pool };
