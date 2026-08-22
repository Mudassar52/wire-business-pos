import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// schema.sql only uses `create table if not exists` / `create index if not
// exists`, so running it again on every server start is always safe — it
// will never drop or overwrite existing data, it just makes sure every
// table/index the app needs actually exists.
export async function runMigrations() {
  const schemaPath = path.join(__dirname, "..", "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  // eslint-disable-next-line no-console
  console.log("Applying sql/schema.sql to database...");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log("✅ Schema is up to date.");
  await backfillCreditSaleLedger();
}

// One-time-per-row data fix, safe to run on every startup: older credit
// sales stored their ledger 'sale' entry as `subtotal - paidAmount` (net of
// any advance paid at checkout), and never recorded that advance as its own
// 'payment' entry. That hid the advance from the customer's ledger — it
// showed a smaller "Billed" figure than the real invoice and no "Received"
// line for the cash actually taken at the counter. This finds any sale
// whose ledger 'sale' entry doesn't yet match the true subtotal, corrects it
// to the full amount, and adds the missing advance-payment entry if there
// was one. Already-fixed rows are left untouched (subtotal matches, so the
// WHERE clause skips them), so re-running this on every boot is harmless.
async function backfillCreditSaleLedger() {
  const { rows: stale } = await pool.query(`
    select s.id as sale_id, s.owner_id, s.customer_id, s.date, s.subtotal, s.paid_amount,
           ct.id as credit_tx_id
    from sales s
    join credit_transactions ct on ct.sale_id = s.id and ct.type = 'sale'
    where s.payment_method = 'credit' and s.customer_id is not null
      and abs(ct.amount - s.subtotal) > 0.01
  `);
  if (!stale.length) return;
  // eslint-disable-next-line no-console
  console.log(`Backfilling ${stale.length} credit sale ledger entr${stale.length === 1 ? "y" : "ies"} to the gross-billed-plus-advance format...`);
  for (const row of stale) {
    await pool.query("update credit_transactions set amount = $1 where id = $2", [row.subtotal, row.credit_tx_id]);
    if (Number(row.paid_amount) > 0) {
      const { rows: existingAdvance } = await pool.query(
        "select id from credit_transactions where sale_id = $1 and type = 'payment' and note = 'Advance received at time of sale'",
        [row.sale_id]
      );
      if (!existingAdvance.length) {
        await pool.query(
          `insert into credit_transactions (owner_id, customer_id, sale_id, type, amount, date, note)
           values ($1,$2,$3,'payment',$4,$5,'Advance received at time of sale')`,
          [row.owner_id, row.customer_id, row.sale_id, row.paid_amount, row.date]
        );
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log("✅ Credit sale ledger backfill complete.");
}

// Allows `npm run migrate` to also be run by hand if ever needed.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runMigrations()
    .then(async () => {
      await pool.end();
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
