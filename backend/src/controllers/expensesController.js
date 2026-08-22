import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toExpense(row) {
  return { id: row.id, title: row.title, category: row.category, amount: Number(row.amount), date: row.date, description: row.description };
}

export const listExpenses = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from expenses where owner_id = $1 order by date desc, id desc", [req.user.id]);
  res.json({ ok: true, expenses: rows.map(toExpense) });
});

const schema = z.object({
  title: z.string().min(1),
  category: z.string().optional().default(""),
  amount: z.number().nonnegative(),
  date: z.string().min(1),
  description: z.string().optional().default(""),
});

export const createExpense = asyncHandler(async (req, res) => {
  const e = schema.parse(req.body);
  const { rows } = await query(
    `insert into expenses (owner_id, title, category, amount, date, description) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.id, e.title, e.category, e.amount, e.date, e.description]
  );
  res.status(201).json({ ok: true, message: "Expense added", expense: toExpense(rows[0]) });
});

export const updateExpense = asyncHandler(async (req, res) => {
  const e = schema.partial().parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ["title", "category", "amount", "date", "description"]) {
    if (e[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(e[key]); }
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update expenses set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Expense not found" });
  res.json({ ok: true, message: "Expense updated", expense: toExpense(rows[0]) });
});

export const removeExpense = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from expenses where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Expense not found" });
  res.json({ ok: true, message: "Expense removed" });
});
