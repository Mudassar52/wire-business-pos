import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toPurchase(row) {
  const quantityKg = Number(row.quantity_kg);
  const purchaseRate = Number(row.purchase_rate);
  const discountAmount = Number(row.discount_amount || 0);
  const total = Math.max(0, quantityKg * purchaseRate - discountAmount);
  return {
    id: row.id,
    supplierId: row.supplier_id,
    invoiceNumber: row.invoice_number,
    date: row.date,
    productId: row.product_id,
    quantityKg,
    purchaseRate,
    discountAmount,
    paidAmount: Number(row.paid_amount),
    notes: row.notes,
    total,
  };
}

export const listPurchases = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from purchases where owner_id = $1 order by date desc, id desc", [req.user.id]);
  res.json({ ok: true, purchases: rows.map(toPurchase) });
});

const purchaseSchema = z.object({
  supplierId: z.number().int(),
  invoiceNumber: z.string().optional().default(""),
  date: z.string().min(1),
  productId: z.number().int(),
  quantityKg: z.number().positive(),
  purchaseRate: z.number().nonnegative(),
  // Supplier discount on this invoice (e.g. supplier gives some stock for
  // free, or knocks a flat amount off the bill). paidAmount is intentionally
  // allowed to be 0 — a free/zero-cost delivery from a supplier is valid.
  discountAmount: z.number().nonnegative().optional().default(0),
  paidAmount: z.number().nonnegative().optional().default(0),
  notes: z.string().optional().default(""),
});

// Adding a purchase increases stock for the product immediately (stock is
// always derived = total purchased - total sold, so nothing else to update).
export const createPurchase = asyncHandler(async (req, res) => {
  const p = purchaseSchema.parse(req.body);
  const { rows } = await query(
    `insert into purchases (owner_id, supplier_id, invoice_number, date, product_id, quantity_kg, purchase_rate, discount_amount, paid_amount, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [req.user.id, p.supplierId, p.invoiceNumber, p.date, p.productId, p.quantityKg, p.purchaseRate, p.discountAmount, p.paidAmount, p.notes]
  );
  res.status(201).json({ ok: true, message: "Purchase added and inventory updated", purchase: toPurchase(rows[0]) });
});

export const updatePurchase = asyncHandler(async (req, res) => {
  const p = purchaseSchema.partial().parse(req.body);
  const colMap = { supplierId: "supplier_id", invoiceNumber: "invoice_number", date: "date", productId: "product_id", quantityKg: "quantity_kg", purchaseRate: "purchase_rate", discountAmount: "discount_amount", paidAmount: "paid_amount", notes: "notes" };
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, col] of Object.entries(colMap)) {
    if (p[key] !== undefined) { fields.push(`${col} = $${i++}`); values.push(p[key]); }
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update purchases set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Purchase not found" });
  res.json({ ok: true, message: "Purchase updated", purchase: toPurchase(rows[0]) });
});

export const removePurchase = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from purchases where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Purchase not found" });
  res.json({ ok: true, message: "Purchase removed" });
});

const payInvoiceSchema = z.object({
  amount: z.number().positive(),
  date: z.string().optional(),
  note: z.string().optional().default(""),
});

export const payPurchaseInvoice = asyncHandler(async (req, res) => {
  const { amount, date, note } = payInvoiceSchema.parse(req.body);

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query(
      "select * from purchases where id = $1 and owner_id = $2 for update",
      [req.params.id, req.user.id]
    );
    const purchase = rows[0];
    if (!purchase) return { ok: false, status: 404, message: "Purchase invoice not found" };

    const total = Math.max(0, Number(purchase.quantity_kg) * Number(purchase.purchase_rate) - Number(purchase.discount_amount || 0));
    const remaining = total - Number(purchase.paid_amount);
    if (amount > remaining + 1e-9) {
      return { ok: false, status: 400, message: "Payment cannot exceed this invoice's outstanding balance" };
    }

    const updated = await client.query(
      "update purchases set paid_amount = paid_amount + $1 where id = $2 returning *",
      [amount, purchase.id]
    );
    const paymentNote = note || `Payment against ${purchase.invoice_number || `PUR-${purchase.id}`}`;
    await client.query(
      `insert into supplier_payments (owner_id, supplier_id, purchase_id, amount, date, note)
       values ($1,$2,$3,$4,coalesce($5, current_date),$6)`,
      [req.user.id, purchase.supplier_id, purchase.id, amount, date || null, paymentNote]
    );
    return { ok: true, purchase: toPurchase(updated.rows[0]) };
  });

  if (!result.ok) return res.status(result.status).json({ ok: false, message: result.message });
  res.json({ ok: true, message: "Payment recorded successfully", purchase: result.purchase });
});
