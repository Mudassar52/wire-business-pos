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
