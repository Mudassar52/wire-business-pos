import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const TABLES = {
  "wire-types": "wire_types",
  thicknesses: "thicknesses",
  "expense-categories": "expense_categories",
};

function resolveTable(req) {
  const table = TABLES[req.params.list];
  if (!table) {
    const err = new Error("Unknown list type");
    err.status = 404;
    throw err;
  }
  return table;
}

export const getList = asyncHandler(async (req, res) => {
  const table = resolveTable(req);
  const { rows } = await query(
    `select name from ${table} where owner_id = $1 order by id asc`,
    [req.user.id]
  );
  res.json({ ok: true, items: rows.map((r) => r.name) });
});

const addSchema = z.object({ name: z.string().min(1) });

export const addListItem = asyncHandler(async (req, res) => {
  const table = resolveTable(req);
  const { name } = addSchema.parse(req.body);
  await query(`insert into ${table} (owner_id, name) values ($1, $2)`, [req.user.id, name]);
  res.status(201).json({ ok: true, message: "Added" });
});

export const removeListItem = asyncHandler(async (req, res) => {
  const table = resolveTable(req);
  const { name } = req.params;
  await query(`delete from ${table} where owner_id = $1 and name = $2`, [req.user.id, name]);
  res.json({ ok: true, message: "Removed" });
});
