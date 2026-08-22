import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const PLAN_DURATION_DAYS = { demo: 3, month: 30, year: 365, custom: 30 };

function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    locked: row.locked,
    plan: row.plan,
    planStart: row.plan_start,
    planEnd: row.plan_end,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// List all admin accounts (the businesses the super admin manages)
// ---------------------------------------------------------------------------
export const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "select * from users where role = 'admin' order by created_at desc"
  );
  res.json({ ok: true, users: rows.map(toPublicUser) });
});

// ---------------------------------------------------------------------------
// Create a new admin (business) account
// ---------------------------------------------------------------------------
const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  password: z.string().min(4),
});

async function generateUsername(email) {
  const base = (email.split("@")[0] || "user").replace(/[^a-z0-9]/gi, "").toLowerCase() || "user";
  let candidate = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await query("select 1 from users where lower(username) = lower($1)", [candidate]);
    if (!rows.length) return candidate;
    candidate = `${base}${n}`;
    n += 1;
  }
}

export const createUser = asyncHandler(async (req, res) => {
  const data = createUserSchema.parse(req.body);
  const email = data.email.trim().toLowerCase();

  const existing = await query("select 1 from users where lower(email) = $1", [email]);
  if (existing.rows.length) {
    return res.status(409).json({ ok: false, message: "An account with this email already exists" });
  }

  const username = await generateUsername(email);
  const passwordHash = await bcrypt.hash(data.password, 10);

  const { rows } = await query(
    `insert into users (username, email, password_hash, name, phone, role, locked, plan, plan_start, plan_end)
     values ($1,$2,$3,$4,$5,'admin', false, null, null, null) returning *`,
    [username, email, passwordHash, data.name, data.phone]
  );
  res.status(201).json({ ok: true, message: "User created", user: toPublicUser(rows[0]) });
});

// ---------------------------------------------------------------------------
// Update / remove / lock accounts
// ---------------------------------------------------------------------------
const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(4).optional(),
});

export const updateUser = asyncHandler(async (req, res) => {
  const data = updateUserSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;

  if (data.name !== undefined) { fields.push(`name = $${i++}`); values.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${i++}`); values.push(data.email.trim().toLowerCase()); }
  if (data.phone !== undefined) { fields.push(`phone = $${i++}`); values.push(data.phone); }
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 10);
    fields.push(`password_hash = $${i++}`);
    values.push(hash);
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });

  values.push(req.params.id);
  const { rows } = await query(
    `update users set ${fields.join(", ")}, updated_at = now() where id = $${i} and role = 'admin' returning *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, message: "User updated", user: toPublicUser(rows[0]) });
});

export const removeUser = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "delete from users where id = $1 and role = 'admin' returning id",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, message: "User removed" });
});

export const setLocked = asyncHandler(async (req, res) => {
  const locked = Boolean(req.body.locked);
  const { rows } = await query(
    "update users set locked = $1, updated_at = now() where id = $2 and role = 'admin' returning *",
    [locked, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, message: locked ? "Account locked" : "Account unlocked", user: toPublicUser(rows[0]) });
});

// ---------------------------------------------------------------------------
// Plan assignment
// ---------------------------------------------------------------------------
const planSchema = z.object({
  plan: z.enum(["demo", "month", "year", "custom"]),
  customDays: z.number().int().positive().optional(),
});

export const assignPlan = asyncHandler(async (req, res) => {
  const { plan, customDays } = planSchema.parse(req.body);
  const days = plan === "custom" ? Math.max(1, Math.round(customDays || PLAN_DURATION_DAYS.custom)) : PLAN_DURATION_DAYS[plan];
  const start = new Date();
  const end = new Date(start.getTime() + days * 86400000);

  const { rows } = await query(
    `update users set plan = $1, plan_start = $2, plan_end = $3, updated_at = now()
     where id = $4 and role = 'admin' returning *`,
    [plan, start.toISOString(), end.toISOString(), req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, message: "Plan assigned", user: toPublicUser(rows[0]) });
});

export const clearPlan = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `update users set plan = null, plan_start = null, plan_end = null, updated_at = now()
     where id = $1 and role = 'admin' returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, message: "Plan cleared", user: toPublicUser(rows[0]) });
});

// ---------------------------------------------------------------------------
// Subscription payments (super admin collects payment from an admin/business)
// ---------------------------------------------------------------------------
export const listPayments = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `select p.*, u.name as user_name, u.username
     from subscription_payments p join users u on u.id = p.user_id
     order by p.date desc`
  );
  res.json({
    ok: true,
    payments: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      username: r.username,
      userName: r.user_name,
      amount: Number(r.amount),
      method: r.method,
      note: r.note,
      date: r.date,
    })),
  });
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

export const recordPayment = asyncHandler(async (req, res) => {
  const { amount, method, note } = paymentSchema.parse(req.body);
  const target = await query("select name from users where id = $1 and role = 'admin'", [req.params.id]);
  if (!target.rows[0]) return res.status(404).json({ ok: false, message: "User not found" });

  const { rows } = await query(
    `insert into subscription_payments (user_id, amount, method, note, created_by)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.params.id, amount, method, note, req.user.id]
  );
  res.status(201).json({
    ok: true,
    message: `Payment of Rs ${amount.toLocaleString()} recorded for ${target.rows[0].name}`,
    payment: rows[0],
  });
});
