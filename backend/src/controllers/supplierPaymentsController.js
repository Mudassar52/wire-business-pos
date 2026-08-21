import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toPayment(row) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    purchaseId: row.purchase_id,
    amount: Number(row.amount),
    date: row.date,
    note: row.note,
  };
}

export const listSupplierPayments = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "select * from supplier_payments where owner_id = $1 order by date desc, id desc",
    [req.user.id]
  );
  res.json({ ok: true, supplierPayments: rows.map(toPayment) });
});

// Free-standing supplier payment (not tied to a specific purchase invoice)
const schema = z.object({
  supplierId: z.number().int(),
  amount: z.number().positive(),
  note: z.string().optional().default(""),
  date: z.string().optional(),
});

export const recordSupplierPayment = asyncHandler(async (req, res) => {
  const { supplierId, amount, note, date } = schema.parse(req.body);
  const { rows } = await query(
    `insert into supplier_payments (owner_id, supplier_id, amount, date, note)
     values ($1,$2,$3,coalesce($4, current_date),$5) returning *`,
    [req.user.id, supplierId, amount, date || null, note]
  );
  res.status(201).json({ ok: true, message: "Payment recorded", supplierPayment: toPayment(rows[0]) });
});

export const removeSupplierPayment = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "delete from supplier_payments where id = $1 and owner_id = $2 returning id",
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Payment not found" });
  res.json({ ok: true, message: "Payment removed" });
});
