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

// Most hosted Postgres providers (Supabase, Neon, Render, Railway) require
// SSL and use certificates that Node won't verify by default. We auto-enable
// SSL for known hosted hostnames so this "just works" even if PG_SSL is
// forgotten in the deploy environment. Set PG_SSL=false explicitly to force
// it off (e.g. for a local/self-hosted Postgres with no SSL at all).
const connectionString = process.env.DATABASE_URL || "";
const looksHosted = /supabase\.co|neon\.tech|render\.com|railway\.app/.test(connectionString);
const sslEnabled = process.env.PG_SSL === "false" ? false : (process.env.PG_SSL === "true" || looksHosted);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
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
