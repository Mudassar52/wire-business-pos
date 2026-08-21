import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in your Supabase connection string."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});

/**
 * Run a query with automatic client checkout/release.
 * @param {string} text
 * @param {any[]} params
 */
export async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a callback inside a single transaction. Rolls back automatically if
 * the callback throws.
 * @param {(client: pg.PoolClient) => Promise<any>} fn
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
