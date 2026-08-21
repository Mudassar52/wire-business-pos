import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";

async function main() {
  const name = process.env.SUPERADMIN_NAME || "Super Admin";
  const email = (process.env.SUPERADMIN_EMAIL || "superadmin@techriwaayat.com").toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || "super123";
  const phone = process.env.SUPERADMIN_PHONE || "";

  const existing = await query("select id from users where lower(email) = $1", [email]);
  if (existing.rows.length) {
    console.log(`Super admin already exists for ${email}, nothing to do.`);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = email.split("@")[0].replace(/[^a-z0-9]/gi, "") || "superadmin";

  await query(
    `insert into users (username, email, password_hash, name, phone, role, locked)
     values ($1,$2,$3,$4,$5,'superadmin', false)`,
    [username, email, passwordHash, name, phone]
  );

  console.log(`Super admin created:\n  email: ${email}\n  password: ${password}\nChange the password after first login.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to seed super admin:", err);
  process.exit(1);
});
