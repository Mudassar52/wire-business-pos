import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toSupplier(row) {
  return { id: row.id, name: row.name, company: row.company, phone: row.phone, address: row.address, notes: row.notes };
}

export const listSuppliers = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from suppliers where owner_id = $1 order by id asc", [req.user.id]);
  res.json({ ok: true, suppliers: rows.map(toSupplier) });
});

const schema = z.object({
  name: z.string().min(1),
  company: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

export const createSupplier = asyncHandler(async (req, res) => {
  const s = schema.parse(req.body);
  const { rows } = await query(
    `insert into suppliers (owner_id, name, company, phone, address, notes) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.id, s.name, s.company, s.phone, s.address, s.notes]
  );
  res.status(201).json({ ok: true, message: "Supplier added", supplier: toSupplier(rows[0]) });
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const s = schema.partial().parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const key of ["name", "company", "phone", "address", "notes"]) {
    if (s[key] !== undefined) { fields.push(`${key} = $${i++}`); values.push(s[key]); }
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update suppliers set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Supplier not found" });
  res.json({ ok: true, message: "Supplier updated", supplier: toSupplier(rows[0]) });
});

export const removeSupplier = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from suppliers where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Supplier not found" });
  res.json({ ok: true, message: "Supplier removed" });
});
