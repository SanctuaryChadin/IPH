// lib/db.js
import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  user: 'system',
  host: '127.0.0.1', 
  database: 'iphreservation',
  password: '+]<H-y[PK({2h=D',
  port: 5432,
});

// Basic query function (no transaction).
export async function dbQuery(queryText, params = []) {
  const res = await pool.query(queryText, params);
  return res;
}

// Transaction helper
export async function runTransaction(transactionQueries) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await transactionQueries(client);
    await client.query('COMMIT');
    return result; 
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
