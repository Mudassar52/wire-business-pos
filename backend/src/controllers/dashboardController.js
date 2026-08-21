import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function parseRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : today;
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : today;
  return { from, to };
}

// Revenue, purchase spend, gross profit, expenses, net profit, credit
// outstanding and stock valuation — the numbers behind the dashboard cards
// and the Reports page's "yesterday" / custom date-range filters.
export const getDashboard = asyncHandler(async (req, res) => {
  const { from, to } = parseRange(req);
  const ownerId = req.user.id;

  const [revenueQ, purchaseQ, expenseQ, creditQ, stockQ] = await Promise.all([
    query(
      "select coalesce(sum(subtotal),0) as revenue, coalesce(sum(gross_profit),0) as gross_profit, count(*) as sales_count from sales where owner_id = $1 and date between $2 and $3",
      [ownerId, from, to]
    ),
    query(
      "select coalesce(sum(quantity_kg * purchase_rate),0) as spend, coalesce(sum(quantity_kg),0) as qty from purchases where owner_id = $1 and date between $2 and $3",
      [ownerId, from, to]
    ),
    query(
      "select coalesce(sum(amount),0) as total from expenses where owner_id = $1 and date between $2 and $3",
      [ownerId, from, to]
    ),
    query(
      `select
         coalesce(sum(case when type = 'sale' then amount else 0 end),0) as debt,
         coalesce(sum(case when type = 'payment' then amount else 0 end),0) as paid
       from credit_transactions where owner_id = $1`,
      [ownerId]
    ),
    query(
      `select p.id, p.purchase_price, p.sale_price,
         coalesce((select sum(quantity_kg) from purchases pu where pu.product_id = p.id and pu.owner_id = $1),0) as purchased,
         coalesce((select sum(sl.quantity_kg) from sale_lines sl join sales s on s.id = sl.sale_id where sl.product_id = p.id and s.owner_id = $1),0) as sold
       from products p where p.owner_id = $1`,
      [ownerId]
    ),
  ]);

  const revenue = Number(revenueQ.rows[0].revenue);
  const grossProfit = Number(revenueQ.rows[0].gross_profit);
  const salesCount = Number(revenueQ.rows[0].sales_count);
  const purchaseSpend = Number(purchaseQ.rows[0].spend);
  const purchaseQty = Number(purchaseQ.rows[0].qty);
  const totalExpenses = Number(expenseQ.rows[0].total);
  const netProfit = grossProfit - totalExpenses;
  const creditOutstanding = Number(creditQ.rows[0].debt) - Number(creditQ.rows[0].paid);

  let stockCost = 0;
  let stockSaleValue = 0;
  for (const row of stockQ.rows) {
    const remaining = Math.max(0, Number(row.purchased) - Number(row.sold));
    stockCost += remaining * Number(row.purchase_price);
    stockSaleValue += remaining * Number(row.sale_price);
  }

  res.json({
    ok: true,
    range: { from, to },
    metrics: {
      revenue,
      grossProfit,
      salesCount,
      purchaseSpend,
      purchaseQty,
      totalExpenses,
      netProfit,
      creditOutstanding,
      stockCost,
      stockSaleValue,
      stockProjectedProfit: stockSaleValue - stockCost,
    },
  });
});
