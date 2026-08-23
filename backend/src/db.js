import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// ---------------------------------------------------------------------------
// IMPORTANT: node-postgres returns BIGINT (OID 20) columns as JS strings by
// default, because a bigint can exceed Number.MAX_SAFE_INTEGER. Every id in
// this schema is a `bigserial` (bigint), so without this, `row.id` and every
// foreign key (supplier_id, product_id, customer_id, ...) comes back as a
// string like "5" instead of the number 5. The frontend compares these ids
// with `===` against real numbers (e.g. `p.id === Number(selectedId)`,
// `useParams` route ids, etc), so a silent string/number mismatch makes
// records that clearly exist look "not found", makes product selection in
// the POS silently fail, and breaks any sale/purchase amount math that
// touches those values. We also parse NUMERIC (OID 1700) as a float for the
// same reason (quantity_kg, prices, etc), as a safety net for any query that
// forgets to wrap a numeric column in Number(...).
pg.types.setTypeParser(pg.types.builtins.INT8, (val) => (val === null ? null : parseInt(val, 10)));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (val) => (val === null ? null : parseFloat(val)));
// IMPORTANT: node-postgres, by default, parses DATE columns (sales.date,
// purchases.date, sale_lines.date, expenses.date, credit_transactions.date,
// supplier_payments.date, etc.) into a JS Date object set to LOCAL midnight
// on whatever machine the server runs on. When that Date is later serialized
// to JSON (res.json), it's converted to a UTC ISO string — which shifts the
// calendar day backwards by one whenever the server's local timezone is
// ahead of UTC (e.g. Pakistan, UTC+5). A sale made "today" can come back to
// the frontend dated "yesterday", so it silently vanishes from any
// date-range filter (Dashboard's Today/This week, Reports) even though the
// sale itself saved successfully and still shows up in the plain sales list.
// Returning the raw "YYYY-MM-DD" string untouched avoids any timezone math.
pg.types.setTypeParser(pg.types.builtins.DATE, (val) => val);

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
