import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toCustomer(row) {
  return { id: row.id, name: row.name, phone: row.phone, address: row.address };
}

export const listCustomers = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from customers where owner_id = $1 order by id asc", [req.user.id]);
  res.json({ ok: true, customers: rows.map(toCustomer) });
});

// Customer + running credit balance (sale debt minus payments), used by the
// Credit Management module.
export const listCustomerBalances = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select c.*,
       coalesce(sum(case when t.type = 'sale' then t.amount else 0 end), 0) as debt,
       coalesce(sum(case when t.type = 'payment' then t.amount else 0 end), 0) as paid
     from customers c
     left join credit_transactions t on t.customer_id = c.id and t.owner_id = c.owner_id
     where c.owner_id = $1
     group by c.id
     order by c.id asc`,
    [req.user.id]
  );
  res.json({
    ok: true,
    customers: rows.map((r) => ({ ...toCustomer(r), balance: Number(r.debt) - Number(r.paid) })),
  });
});

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
});

export const createCustomer = asyncHandler(async (req, res) => {
  const c = schema.parse(req.body);
  const { rows } = await query(
    `insert into customers (owner_id, name, phone, address) values ($1,$2,$3,$4) returning *`,
    [req.user.id, c.name, c.phone, c.address]
  );
  res.status(201).json({ ok: true, message: "Customer added", customer: toCustomer(rows[0]) });
});

export const updateCustomer = asyncHandler(async (req, res) => {
  const c = schema.partial().parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ["name", "phone", "address"]) {
    if (c[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(c[key]); }
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update customers set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Customer not found" });
  res.json({ ok: true, message: "Customer updated", customer: toCustomer(rows[0]) });
});

export const removeCustomer = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from customers where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Customer not found" });
  res.json({ ok: true, message: "Customer removed" });
});
