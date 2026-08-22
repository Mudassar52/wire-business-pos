import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    wireType: row.wire_type,
    thickness: row.thickness,
    purchasePrice: Number(row.purchase_price),
    salePrice: Number(row.sale_price),
    minStock: Number(row.min_stock),
  };
}

// Purchased/sold quantities per product, computed straight from the DB so
// stock is always derived from real purchase + sale history (never stored).
async function inventoryMap(ownerId) {
  const purchasedQ = query(
    `select product_id, coalesce(sum(quantity_kg),0) as qty
     from purchases where owner_id = $1 group by product_id`,
    [ownerId]
  );
  const soldQ = query(
    `select sl.product_id, coalesce(sum(sl.quantity_kg),0) as qty
     from sale_lines sl join sales s on s.id = sl.sale_id
     where s.owner_id = $1 group by sl.product_id`,
    [ownerId]
  );
  const [purchased, sold] = await Promise.all([purchasedQ, soldQ]);
  const map = new Map();
  for (const r of purchased.rows) map.set(r.product_id, { purchased: Number(r.qty), sold: 0 });
  for (const r of sold.rows) {
    const cur = map.get(r.product_id) || { purchased: 0, sold: 0 };
    cur.sold = Number(r.qty);
    map.set(r.product_id, cur);
  }
  return map;
}

export const listProducts = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "select * from products where owner_id = $1 order by id asc",
    [req.user.id]
  );
  const inv = await inventoryMap(req.user.id);
  const withStats = rows.map((row) => {
    const product = toProduct(row);
    const stats = inv.get(row.id) || { purchased: 0, sold: 0 };
    const remaining = Math.max(0, stats.purchased - stats.sold);
    return {
      ...product,
      purchased: stats.purchased,
      sold: stats.sold,
      remaining,
      cost: remaining * product.purchasePrice,
      sale: remaining * product.salePrice,
      profit: remaining * (product.salePrice - product.purchasePrice),
    };
  });
  res.json({ ok: true, products: withStats });
});

const productSchema = z.object({
  name: z.string().min(1),
  wireType: z.string().optional().default(""),
  thickness: z.string().optional().default(""),
  purchasePrice: z.number().nonnegative(),
  salePrice: z.number().nonnegative(),
  minStock: z.number().nonnegative().optional().default(0),
});

export const createProduct = asyncHandler(async (req, res) => {
  const p = productSchema.parse(req.body);
  const { rows } = await query(
    `insert into products (owner_id, name, wire_type, thickness, purchase_price, sale_price, min_stock)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [req.user.id, p.name, p.wireType, p.thickness, p.purchasePrice, p.salePrice, p.minStock]
  );
  res.status(201).json({ ok: true, message: "Product added", product: toProduct(rows[0]) });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const p = productSchema.partial().parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  const colMap = { name: "name", wireType: "wire_type", thickness: "thickness", purchasePrice: "purchase_price", salePrice: "sale_price", minStock: "min_stock" };
  for (const [key, col] of Object.entries(colMap)) {
    if (p[key] !== undefined) { fields.push(`${col} = $${i++}`); values.push(p[key]); }
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.params.id, req.user.id);
  const { rows } = await query(
    `update products set ${fields.join(", ")} where id = $${i++} and owner_id = $${i} returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Product not found" });
  res.json({ ok: true, message: "Product updated", product: toProduct(rows[0]) });
});

export const removeProduct = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "delete from products where id = $1 and owner_id = $2 returning id",
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "Product not found" });
  res.json({ ok: true, message: "Product removed" });
});
