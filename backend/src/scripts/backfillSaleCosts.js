// One-time backfill: recompute gross_profit for every existing sale using
// the real weighted-average purchase cost per product (from the
// `purchases` table), the same logic salesController now applies to every
// new sale/edit going forward. Run this once after deploying the fix so
// historical sales/dashboard figures match the corrected logic instead of
// whatever the products.purchase_price field happened to say when each
// sale was originally entered.
//
// Usage:
//   node src/scripts/backfillSaleCosts.js            (dry run — prints changes only)
//   node src/scripts/backfillSaleCosts.js --apply     (writes the changes)
//
// Safe to re-run: it always recalculates from purchases + sale_lines
// quantities/sale_rate, it never depends on previous backfill runs.

import { pool } from "../db.js";

const APPLY = process.argv.includes("--apply");

async function weightedAvgCost(client, ownerId, productId) {
  const { rows } = await client.query(
    `select coalesce(sum(quantity_kg * purchase_rate - coalesce(discount_amount,0)),0) as cost,
            coalesce(sum(quantity_kg),0) as qty
     from purchases where owner_id = $1 and product_id = $2`,
    [ownerId, productId]
  );
  const qty = Number(rows[0].qty);
  const cost = Number(rows[0].cost);
  return qty > 0 ? cost / qty : 0;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: sales } = await client.query("select * from sales order by id asc");
    let changedCount = 0;
    let totalOldGross = 0;
    let totalNewGross = 0;

    for (const sale of sales) {
      const { rows: lines } = await client.query(
        "select * from sale_lines where sale_id = $1",
        [sale.id]
      );

      let grossProfitBeforeDiscount = 0;
      const newLineRates = [];
      for (const line of lines) {
        const avgCost = await weightedAvgCost(client, sale.owner_id, line.product_id);
        grossProfitBeforeDiscount += Number(line.quantity_kg) * (Number(line.sale_rate) - avgCost);
        newLineRates.push({ id: line.id, oldRate: Number(line.purchase_rate), newRate: avgCost });
      }
      const discountAmount = Number(sale.discount_amount || 0);
      const newGrossProfit = grossProfitBeforeDiscount - discountAmount;
      const oldGrossProfit = Number(sale.gross_profit);

      totalOldGross += oldGrossProfit;
      totalNewGross += newGrossProfit;

      if (Math.abs(newGrossProfit - oldGrossProfit) > 0.005) {
        changedCount++;
        console.log(
          `Sale #${sale.id} (${sale.date}): gross_profit ${oldGrossProfit.toFixed(2)} -> ${newGrossProfit.toFixed(2)}`
        );
        for (const l of newLineRates) {
          if (Math.abs(l.newRate - l.oldRate) > 0.0001) {
            console.log(`   line ${l.id}: purchase_rate ${l.oldRate} -> ${l.newRate.toFixed(4)}`);
          }
        }
        if (APPLY) {
          await client.query("update sales set gross_profit = $1 where id = $2", [newGrossProfit, sale.id]);
          for (const l of newLineRates) {
            await client.query("update sale_lines set purchase_rate = $1 where id = $2", [l.newRate, l.id]);
          }
        }
      }
    }

    console.log("---");
    console.log(`Sales inspected: ${sales.length}, sales needing correction: ${changedCount}`);
    console.log(`Total gross profit — old: ${totalOldGross.toFixed(2)}, new: ${totalNewGross.toFixed(2)}, diff: ${(totalNewGross - totalOldGross).toFixed(2)}`);

    if (APPLY) {
      await client.query("COMMIT");
      console.log("Changes committed.");
    } else {
      await client.query("ROLLBACK");
      console.log("Dry run only — nothing written. Re-run with --apply to save these changes.");
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
