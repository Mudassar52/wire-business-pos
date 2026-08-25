import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toRecord(row) {
  return { id: row.id, productId: row.product_id, quantityKg: Number(row.quantity_kg), reason: row.reason, date: row.date, notes: row.notes };
}

export const listLossRecords = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from loss_records where owner_id = $1 order by date desc, id desc", [req.user.id]);
  res.json({ ok: true, lossRecords: rows.map(toRecord) });
});

const schema = z.object({
  productId: z.number().int(),
  quantityKg: z.number().positive(),
  reason: z.string().optional().default(""),
  date: z.string().min(1),
  notes: z.string().optional().default(""),
});

export const createLossRecord = asyncHandler(async (req, res) => {
  const l = schema.parse(req.body);
  const { rows } = await query(
    `insert into loss_records (owner_id, product_id, quantity_kg, reason, date, notes) values ($1,$2,$3,$4,$5,$6) returning *`,
    [req.user.id, l.productId, l.quantityKg, l.reason, l.date, l.notes]
  );
  res.status(201).json({ ok: true, message: "Loss recorded", lossRecord: toRecord(rows[0]) });
});

export const removeLossRecord = asyncHandler(async (req, res) => {
  const { rows } = await query("delete from loss_records where id = $1 and owner_id = $2 returning id", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Record not found" });
  res.json({ ok: true, message: "Loss record removed" });
});
