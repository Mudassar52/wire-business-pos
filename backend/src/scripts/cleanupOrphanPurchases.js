// Finds purchases whose product no longer exists (product_id is NULL —
// this happens because purchases.product_id uses "ON DELETE SET NULL": if
// you delete a Product, any purchase invoices that referenced it are NOT
// deleted, just unlinked, and quietly sit in the database forever,
// invisible in the UI but still counted in the Dashboard's purchase-spend
// total. This script finds and removes those leftover records for real.
//
// Usage:
//   node src/scripts/cleanupOrphanPurchases.js            (dry run — lists them only)
//   node src/scripts/cleanupOrphanPurchases.js --apply     (actually deletes them)

import { pool } from "../db.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select * from purchases where product_id is null order by id asc`
    );

    if (!rows.length) {
      console.log("No orphaned purchases found — nothing to clean up.");
      await client.query("ROLLBACK");
      return;
    }

    console.log(`Found ${rows.length} orphaned purchase(s):`);
    for (const r of rows) {
      console.log(
        `  id=${r.id} invoice=${r.invoice_number} date=${r.date} qty=${r.quantity_kg} rate=${r.purchase_rate} paid=${r.paid_amount} owner_id=${r.owner_id}`
      );
    }

    if (APPLY) {
      const ids = rows.map((r) => r.id);
      await client.query(`delete from purchases where id = any($1::bigint[])`, [ids]);
      await client.query("COMMIT");
      console.log(`Deleted ${ids.length} orphaned purchase(s) for good.`);
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run only — nothing deleted. Re-run with --apply to remove these for real.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
