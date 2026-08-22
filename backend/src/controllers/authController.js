import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const { rows } = await query("select * from users where lower(email) = lower($1)", [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ ok: false, message: "No account found with this email" });

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) return res.status(401).json({ ok: false, message: "Incorrect password" });

  if (user.locked) {
    return res.status(403).json({
      ok: false,
      message: "This account has been locked by the administrator. Contact support to regain access.",
    });
  }

  if (user.role === "admin" && user.plan_end && new Date(user.plan_end).getTime() < Date.now()) {
    return res.status(403).json({
      ok: false,
      message: "Your subscription has expired. Contact the administrator to renew your plan.",
    });
  }

  const token = signToken({ id: user.id, role: user.role, email: user.email });
  res.json({ ok: true, message: `Welcome back, ${user.name}`, token, user: toPublicUser(user) });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query("select * from users where id = $1", [req.user.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ ok: false, message: "User not found" });
  res.json({ ok: true, user: toPublicUser(user) });
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updateProfile = asyncHandler(async (req, res) => {
  const data = profileSchema.parse(req.body);
  const fields = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = $${i++}`);
    values.push(value);
  }
  if (!fields.length) return res.json({ ok: true, message: "Nothing to update" });
  values.push(req.user.id);
  const { rows } = await query(
    `update users set ${fields.join(", ")}, updated_at = now() where id = $${i} returning *`,
    values
  );
  res.json({ ok: true, message: "Profile updated", user: toPublicUser(rows[0]) });
});

const passwordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(4),
});

export const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = passwordSchema.parse(req.body);
  const { rows } = await query("select password_hash from users where id = $1", [req.user.id]);
  const user = rows[0];
  if (!user) return res.status(404).json({ ok: false, message: "User not found" });

  const ok = await bcrypt.compare(oldPassword, user.password_hash);
  if (!ok) return res.status(400).json({ ok: false, message: "Current password is incorrect" });

  const hash = await bcrypt.hash(newPassword, 10);
  await query("update users set password_hash = $1, updated_at = now() where id = $2", [hash, req.user.id]);
  res.json({ ok: true, message: "Password changed successfully" });
});
