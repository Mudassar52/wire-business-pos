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
  await alignForeignKeyBehavior();
  await backfillSaleCosts();
  await backfillSaleTotals();
  await backfillCreditSaleLedger();
  await cleanupOrphanPurchases();
}

// `create table if not exists` (above) only affects brand-new installs — on
// a database that already had `purchases`/`sale_lines` created before this
// schema declared `on delete restrict`, the old ON DELETE SET NULL (or no
// rule at all) behavior is still silently active, because CREATE TABLE
// never touches an existing table's constraints. That's how deleting a
// Product/Supplier that still had Purchase invoices against it used to
// leave those invoices behind as "orphan" rows — invisible in the UI (no
// product/supplier name to show), but still counted in Dashboard's total
// purchase spend. This detects the live constraint on each column and
// re-creates it as ON DELETE RESTRICT if it isn't already, so from here on
// deleting a Product/Supplier with existing purchases is blocked with a
// clear error instead of silently orphaning the record. Safe to run on
// every boot — it's a no-op once the constraint is already correct.
async function alignForeignKeyBehavior() {
  const fixes = [
    { table: "purchases", column: "supplier_id", refTable: "suppliers" },
    { table: "purchases", column: "product_id", refTable: "products" },
    { table: "sale_lines", column: "product_id", refTable: "products" },
  ];
  for (const fx of fixes) {
    const { rows } = await pool.query(
      `select con.conname, con.confdeltype
       from pg_constraint con
       join pg_class rel on rel.oid = con.conrelid
       where rel.relname = $1 and con.contype = 'f' and con.confrelid = $2::regclass`,
      [fx.table, fx.refTable]
    );
    const existing = rows[0];
    if (existing && existing.confdeltype === "r") continue; // already ON DELETE RESTRICT
    if (existing) {
      await pool.query(`alter table ${fx.table} drop constraint "${existing.conname}"`);
    }
    await pool.query(
      `alter table ${fx.table} add constraint ${fx.table}_${fx.column}_fkey
       foreign key (${fx.column}) references ${fx.refTable}(id) on delete restrict`
    );
    // eslint-disable-next-line no-console
    console.log(`Aligned FK: ${fx.table}.${fx.column} -> ${fx.refTable}(id) is now ON DELETE RESTRICT`);
  }
}

// One-time-per-row data fix, safe to run on every startup: each sale_line's
// `purchase_rate` should reflect the real weighted-average cost of that
// product across all its Purchase invoices, but on older data it was
// sometimes stamped from whatever `products.purchase_price` happened to say
// at the time of sale — which drifts out of sync as new purchases come in
// at different rates. This recalculates every sale_line's purchase_rate
// from the real purchases table and writes back only the ones that differ.
// backfillSaleTotals (below) then recomputes each sale's own gross_profit
// from these corrected line rates. Safe to re-run on every boot — it always
// derives fresh from purchases, never from a previous backfill's output.
async function backfillSaleCosts() {
  const { rows: lines } = await pool.query(
    `select sl.id, sl.product_id, sl.purchase_rate, s.owner_id
     from sale_lines sl join sales s on s.id = sl.sale_id`
  );
  const costCache = new Map(); // `${ownerId}:${productId}` -> weighted avg cost
  for (const line of lines) {
    const cacheKey = `${line.owner_id}:${line.product_id}`;
    let avgCost = costCache.get(cacheKey);
    if (avgCost === undefined) {
      const { rows } = await pool.query(
        `select coalesce(sum(quantity_kg * purchase_rate - coalesce(discount_amount,0)),0) as cost,
                coalesce(sum(quantity_kg),0) as qty
         from purchases where owner_id = $1 and product_id = $2`,
        [line.owner_id, line.product_id]
      );
      const qty = Number(rows[0].qty);
      avgCost = qty > 0 ? Number(rows[0].cost) / qty : Number(line.purchase_rate);
      costCache.set(cacheKey, avgCost);
    }
    if (Math.abs(avgCost - Number(line.purchase_rate)) > 0.0001) {
      await pool.query("update sale_lines set purchase_rate = $1 where id = $2", [avgCost, line.id]);
    }
  }
}

// One-time-per-row data fix, safe to run on every startup: a sale's
// subtotal/gross_profit should always equal what its own sale_lines add up
// to (minus discount_amount), but some sales were found with stale totals
// that no longer matched their line items — most likely from an earlier
// version of the app that updated a sale's lines without recalculating the
// sale's own aggregate totals. That silently understated Reports' "Net
// profit" by however much those sales were off. This recalculates every
// sale's totals fresh from its lines and only writes back the ones that
// actually differ, so it's safe (and cheap) to run on every boot.
async function backfillSaleTotals() {
  const { rows: sales } = await pool.query("select id, subtotal, discount_amount, gross_profit from sales");
  for (const sale of sales) {
    const { rows: lines } = await pool.query(
      "select quantity_kg, sale_rate, purchase_rate from sale_lines where sale_id = $1",
      [sale.id]
    );
    if (!lines.length) continue;
    const grossSubtotal = lines.reduce((a, l) => a + Number(l.quantity_kg) * Number(l.sale_rate), 0);
    const grossProfitBeforeDiscount = lines.reduce((a, l) => a + Number(l.quantity_kg) * (Number(l.sale_rate) - Number(l.purchase_rate)), 0);
    const discountAmount = Number(sale.discount_amount || 0);
    const correctSubtotal = Math.max(0, grossSubtotal - discountAmount);
    const correctGrossProfit = grossProfitBeforeDiscount - discountAmount;
    if (Math.abs(correctSubtotal - Number(sale.subtotal)) > 0.01 || Math.abs(correctGrossProfit - Number(sale.gross_profit)) > 0.01) {
      // eslint-disable-next-line no-console
      console.log(`Fixing Sale #${sale.id}: subtotal ${sale.subtotal} -> ${correctSubtotal.toFixed(2)}, gross profit ${sale.gross_profit} -> ${correctGrossProfit.toFixed(2)}`);
      await pool.query("update sales set subtotal = $1, gross_profit = $2 where id = $3", [correctSubtotal, correctGrossProfit, sale.id]);
    }
  }
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

// One-time cleanup, safe to run on every startup: on older data, deleting a
// Product left its Purchase invoices behind as "orphan" rows (product_id
// set to null instead of the row being removed) — invisible in the UI, but
// still silently counted in the Dashboard's total purchase spend. Now that
// alignForeignKeyBehavior() (above) blocks that from happening going
// forward, this removes any leftover orphan rows from before the fix. Once
// they're gone this is a no-op on every future boot.
async function cleanupOrphanPurchases() {
  const { rows } = await pool.query(`select id from purchases where product_id is null`);
  if (!rows.length) return;
  const ids = rows.map((r) => r.id);
  await pool.query(`delete from purchases where id = any($1::bigint[])`, [ids]);
  // eslint-disable-next-line no-console
  console.log(`Removed ${ids.length} orphaned purchase(s) left over from before the FK fix.`);
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
