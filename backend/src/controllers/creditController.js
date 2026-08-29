import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listCreditTransactions = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "select * from credit_transactions where owner_id = $1 order by date desc, id desc",
    [req.user.id]
  );
  res.json({
    ok: true,
    creditTransactions: rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      saleId: r.sale_id,
      type: r.type,
      amount: Number(r.amount),
      date: r.date,
      note: r.note,
    })),
  });
});

const paymentSchema = z.object({
  customerId: z.number().int(),
  amount: z.number().positive(),
  note: z.string().optional().default(""),
  date: z.string().optional(),
});

// A general payment against a customer's outstanding balance (not tied to
// one specific sale — use POST /sales/:id/payments for that).
export const recordCustomerPayment = asyncHandler(async (req, res) => {
  const { customerId, amount, note, date } = paymentSchema.parse(req.body);
  const { rows } = await query(
    `insert into credit_transactions (owner_id, customer_id, sale_id, type, amount, date, note)
     values ($1,$2,null,'payment',$3,coalesce($4,current_date),$5) returning *`,
    [req.user.id, customerId, amount, date || null, note]
  );
  res.status(201).json({ ok: true, message: "Payment recorded", transaction: rows[0] });
});

function toTransaction(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    saleId: row.sale_id,
    type: row.type,
    amount: Number(row.amount),
    date: row.date,
    note: row.note,
  };
}

const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  note: z.string().optional(),
  date: z.string().optional(),
});

// Edit a manually-recorded payment entry in a customer's credit ledger
// (general payments and payments recorded against a specific sale both
// live in this table as type='payment'). Sale entries (type='sale') are
// generated from the sale record itself and are intentionally excluded —
// editing those belongs on the sale, not the ledger row.
export const updateCustomerPayment = asyncHandler(async (req, res) => {
  const body = updatePaymentSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  if (body.amount !== undefined) { fields.push(`amount = $${i++}`); values.push(body.amount); }
  if (body.note !== undefined) { fields.push(`note = $${i++}`); values.push(body.note); }
  if (body.date !== undefined) { fields.push(`date = $${i++}`); values.push(body.date); }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update credit_transactions set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} and type = 'payment' returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Payment not found" });
  res.json({ ok: true, message: "Payment updated", transaction: toTransaction(rows[0]) });
});

export const removeCustomerPayment = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "delete from credit_transactions where id = $1 and owner_id = $2 and type = 'payment' returning id",
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Payment not found" });
  res.json({ ok: true, message: "Payment removed" });
});
