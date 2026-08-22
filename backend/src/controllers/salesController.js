import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const lineSchema = z.object({
  productId: z.number().int(),
  quantityKg: z.number().positive(),
  saleRate: z.number().nonnegative(),
  purchaseRate: z.number().nonnegative(),
  date: z.string().optional(),
});

function toSale(row, lines) {
  return {
    id: row.id,
    date: row.date,
    customerId: row.customer_id,
    walkInName: row.walk_in_name || "",
    walkInPhone: row.walk_in_phone || "",
    walkInAddress: row.walk_in_address || "",
    paymentMethod: row.payment_method,
    // subtotal/grossProfit are already net of discountAmount (the frontend
    // computes them that way before sending), discountAmount is stored
    // alongside purely so invoices/receipts can show it as its own line.
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount || 0),
    grossProfit: Number(row.gross_profit),
    paidAmount: Number(row.paid_amount),
    lines: lines.map((l) => ({
      productId: l.product_id,
      quantityKg: Number(l.quantity_kg),
      saleRate: Number(l.sale_rate),
      purchaseRate: Number(l.purchase_rate),
      date: l.date,
    })),
  };
}

export const listSales = asyncHandler(async (req, res) => {
  const { rows: sales } = await query("select * from sales where owner_id = $1 order by date desc, id desc", [req.user.id]);
  const { rows: allLines } = await query(
    `select sl.* from sale_lines sl join sales s on s.id = sl.sale_id where s.owner_id = $1`,
    [req.user.id]
  );
  const linesBySale = new Map();
  for (const l of allLines) {
    const arr = linesBySale.get(l.sale_id) || [];
    arr.push(l);
    linesBySale.set(l.sale_id, arr);
  }
  res.json({ ok: true, sales: sales.map((s) => toSale(s, linesBySale.get(s.id) || [])) });
});

// ---------------------------------------------------------------------------
// Complete a new sale (POS checkout)
// ---------------------------------------------------------------------------
const completeSaleSchema = z.object({
  date: z.string().min(1),
  customerId: z.number().int().nullable().optional(),
  walkInName: z.string().optional().default(""),
  walkInPhone: z.string().optional().default(""),
  walkInAddress: z.string().optional().default(""),
  paymentMethod: z.enum(["cash", "credit"]),
  paidAmount: z.number().nonnegative(),
  // Cash/dollar discount applied at the counter. The frontend already nets
  // this out of `subtotal`/`grossProfit` it sends; we just persist it too.
  discountAmount: z.number().nonnegative().optional().default(0),
  lines: z.array(lineSchema).min(1),
  newCustomer: z.object({ name: z.string(), phone: z.string().optional().default(""), address: z.string().optional().default("") }).optional(),
});

async function availableStock(client, ownerId, productId, excludeSaleId = null) {
  const purchasedQ = await client.query(
    "select coalesce(sum(quantity_kg),0) as qty from purchases where owner_id = $1 and product_id = $2",
    [ownerId, productId]
  );
  const soldQ = await client.query(
    excludeSaleId
      ? `select coalesce(sum(sl.quantity_kg),0) as qty from sale_lines sl join sales s on s.id = sl.sale_id
         where s.owner_id = $1 and sl.product_id = $2 and s.id <> $3`
      : `select coalesce(sum(sl.quantity_kg),0) as qty from sale_lines sl join sales s on s.id = sl.sale_id
         where s.owner_id = $1 and sl.product_id = $2`,
    excludeSaleId ? [ownerId, productId, excludeSaleId] : [ownerId, productId]
  );
  return Number(purchasedQ.rows[0].qty) - Number(soldQ.rows[0].qty);
}

export const completeSale = asyncHandler(async (req, res) => {
  const body = completeSaleSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    // Aggregate needed quantity per product and check stock.
    const neededByProduct = new Map();
    for (const l of body.lines) neededByProduct.set(l.productId, (neededByProduct.get(l.productId) || 0) + l.quantityKg);
    for (const [productId, needed] of neededByProduct) {
      const available = await availableStock(client, req.user.id, productId);
      if (needed > available + 1e-9) {
        const { rows } = await client.query("select name from products where id = $1", [productId]);
        return { ok: false, message: `Insufficient stock for ${rows[0]?.name || "selected product"}` };
      }
    }

    let customerId = body.customerId ?? null;
    if (!customerId && body.newCustomer?.name?.trim()) {
      const { rows } = await client.query(
        "insert into customers (owner_id, name, phone, address) values ($1,$2,$3,$4) returning id",
        [req.user.id, body.newCustomer.name.trim(), body.newCustomer.phone.trim(), body.newCustomer.address.trim()]
      );
      customerId = rows[0].id;
    }

    const grossSubtotal = body.lines.reduce((a, l) => a + l.quantityKg * l.saleRate, 0);
    const grossProfitBeforeDiscount = body.lines.reduce((a, l) => a + l.quantityKg * (l.saleRate - l.purchaseRate), 0);
    const discountAmount = Math.min(body.discountAmount, grossSubtotal);
    const subtotal = Math.max(0, grossSubtotal - discountAmount);
    const grossProfit = grossProfitBeforeDiscount - discountAmount;

    const saleInsert = await client.query(
      `insert into sales (owner_id, date, customer_id, walk_in_name, walk_in_phone, walk_in_address, payment_method, subtotal, discount_amount, gross_profit, paid_amount)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
      [req.user.id, body.date, customerId, body.walkInName, body.walkInPhone, body.walkInAddress, body.paymentMethod, subtotal, discountAmount, grossProfit, body.paidAmount]
    );
    const sale = saleInsert.rows[0];

    const insertedLines = [];
    for (const l of body.lines) {
      // Resolve the line's date in JS rather than with `coalesce($a,$b)` in
      // SQL: passing two untyped parameters into COALESCE gives Postgres
      // nothing to infer their type from, so it silently treats them as
      // plain text — which then fails to insert into the `date` column with
      // "column is of type date but expression is of type text". A single
      // resolved value assigned straight to the column has no such ambiguity.
      const lineDate = l.date || body.date;
      const lr = await client.query(
        `insert into sale_lines (sale_id, product_id, quantity_kg, sale_rate, purchase_rate, date)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [sale.id, l.productId, l.quantityKg, l.saleRate, l.purchaseRate, lineDate]
      );
      insertedLines.push(lr.rows[0]);
    }

    if (body.paymentMethod === "credit" && customerId) {
      await client.query(
        `insert into credit_transactions (owner_id, customer_id, sale_id, type, amount, date, note)
         values ($1,$2,$3,'sale',$4,$5,'Credit sale')`,
        [req.user.id, customerId, sale.id, subtotal - body.paidAmount, body.date]
      );
    }

    return { ok: true, sale: toSale(sale, insertedLines) };
  });

  if (!result.ok) return res.status(400).json({ ok: false, message: result.message });
  res.status(201).json({ ok: true, message: "Sale completed successfully", sale: result.sale });
});

// ---------------------------------------------------------------------------
// Edit an existing sale
// ---------------------------------------------------------------------------
const editSaleSchema = z.object({
  lines: z.array(lineSchema).min(1),
  customerId: z.number().int().nullable().optional(),
  paymentMethod: z.enum(["cash", "credit"]).optional(),
  paidAmount: z.number().nonnegative().optional(),
  discountAmount: z.number().nonnegative().optional(),
});

export const editSale = asyncHandler(async (req, res) => {
  const body = editSaleSchema.parse(req.body);
  const saleId = Number(req.params.id);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query("select * from sales where id = $1 and owner_id = $2 for update", [saleId, req.user.id]);
    const sale = rows[0];
    if (!sale) return { ok: false, status: 404, message: "Sale not found" };

    const neededByProduct = new Map();
    for (const l of body.lines) neededByProduct.set(l.productId, (neededByProduct.get(l.productId) || 0) + l.quantityKg);
    for (const [productId, needed] of neededByProduct) {
      const available = await availableStock(client, req.user.id, productId, saleId);
      if (needed > available + 1e-9) {
        const p = await client.query("select name from products where id = $1", [productId]);
        return { ok: false, status: 400, message: `Insufficient stock for ${p.rows[0]?.name || "selected product"}. Available: ${(available / 1000).toFixed(3)} Ton` };
      }
    }

    const grossSubtotal = body.lines.reduce((a, l) => a + l.quantityKg * l.saleRate, 0);
    const grossProfitBeforeDiscount = body.lines.reduce((a, l) => a + l.quantityKg * (l.saleRate - l.purchaseRate), 0);
    const discountAmount = Math.min(body.discountAmount ?? Number(sale.discount_amount || 0), grossSubtotal);
    const subtotal = Math.max(0, grossSubtotal - discountAmount);
    const grossProfit = grossProfitBeforeDiscount - discountAmount;
    const paidAmount = body.paidAmount ?? Number(sale.paid_amount);
    const paymentMethod = body.paymentMethod ?? sale.payment_method;
    const customerId = body.customerId !== undefined ? body.customerId : sale.customer_id;

    const updated = await client.query(
      `update sales set subtotal = $1, discount_amount = $2, gross_profit = $3, paid_amount = $4, payment_method = $5, customer_id = $6
       where id = $7 returning *`,
      [subtotal, discountAmount, grossProfit, paidAmount, paymentMethod, customerId, saleId]
    );

    await client.query("delete from sale_lines where sale_id = $1", [saleId]);
    const insertedLines = [];
    for (const l of body.lines) {
      const lineDate = l.date || sale.date;
      const lr = await client.query(
        `insert into sale_lines (sale_id, product_id, quantity_kg, sale_rate, purchase_rate, date)
         values ($1,$2,$3,$4,$5,$6) returning *`,
        [saleId, l.productId, l.quantityKg, l.saleRate, l.purchaseRate, lineDate]
      );
      insertedLines.push(lr.rows[0]);
    }

    const existingDebtTx = await client.query(
      "select * from credit_transactions where sale_id = $1 and type = 'sale'",
      [saleId]
    );
    if (paymentMethod === "credit" && customerId) {
      const debt = subtotal - paidAmount;
      if (existingDebtTx.rows[0]) {
        await client.query("update credit_transactions set amount = $1, customer_id = $2 where id = $3", [debt, customerId, existingDebtTx.rows[0].id]);
      } else {
        await client.query(
          `insert into credit_transactions (owner_id, customer_id, sale_id, type, amount, date, note)
           values ($1,$2,$3,'sale',$4,$5,'Credit sale')`,
          [req.user.id, customerId, saleId, debt, sale.date]
        );
      }
    } else if (existingDebtTx.rows[0]) {
      await client.query("delete from credit_transactions where id = $1", [existingDebtTx.rows[0].id]);
    }

    return { ok: true, sale: toSale(updated.rows[0], insertedLines) };
  });

  if (!result.ok) return res.status(result.status || 400).json({ ok: false, message: result.message });
  res.json({ ok: true, message: "Sale updated successfully", sale: result.sale });
});

export const removeSale = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from sales where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Sale not found" });
  await query("delete from credit_transactions where sale_id = $1", [req.params.id]);
  res.json({ ok: true, message: "Sale removed" });
});

const salePaymentSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional().default(""),
  date: z.string().optional(),
});

export const recordSalePayment = asyncHandler(async (req, res) => {
  const { amount, note, date } = salePaymentSchema.parse(req.body);
  const { rows } = await query("select * from sales where id = $1 and owner_id = $2", [req.params.id, req.user.id]);
  const sale = rows[0];
  if (!sale || !sale.customer_id) return res.status(400).json({ ok: false, message: "This sale has no linked customer account" });

  const { rows: inserted } = await query(
    `insert into credit_transactions (owner_id, customer_id, sale_id, type, amount, date, note)
     values ($1,$2,$3,'payment',$4,coalesce($5,current_date),$6) returning *`,
    [req.user.id, sale.customer_id, sale.id, amount, date || null, note || "Payment against this sale"]
  );
  res.status(201).json({ ok: true, message: "Payment recorded successfully", payment: inserted[0] });
});

// Payment/settlement info for a single sale: total paid so far and remaining balance.
export const getSalePaymentInfo = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from sales where id = $1 and owner_id = $2", [req.params.id, req.user.id]);
  const sale = rows[0];
  if (!sale) return res.status(404).json({ ok: false, message: "Sale not found" });

  const { rows: payments } = await query(
    "select * from credit_transactions where sale_id = $1 and type = 'payment' order by date asc, id asc",
    [sale.id]
  );
  const paidAfterSale = payments.reduce((a, p) => a + Number(p.amount), 0);
  const totalPaid = Number(sale.paid_amount) + paidAfterSale;
  const remaining = Math.max(0, Number(sale.subtotal) - totalPaid);
  res.json({ ok: true, payments, paidAfterSale, totalPaid, remaining });
});
