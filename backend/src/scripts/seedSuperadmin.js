import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcryptjs";
import { pool, query } from "../db.js";
import { runMigrations } from "../db/migrate.js";

// Reusable version — does NOT close the pool, so it's safe to call from a
// long-running server on startup (see server.js's AUTO_SEED_SUPERADMIN
// option) as well as from the standalone CLI script below.
export async function ensureSuperAdmin() {
  const name = process.env.SUPERADMIN_NAME || "Super Admin";
  const email = (process.env.SUPERADMIN_EMAIL || "superadmin@techriwaayat.com").toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || "super123";
  const phone = process.env.SUPERADMIN_PHONE || "";

  const existing = await query("select id from users where lower(email) = $1", [email]);
  if (existing.rows.length) {
    // eslint-disable-next-line no-console
    console.log(`Super admin already exists for ${email}, nothing to do.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const username = email.split("@")[0].replace(/[^a-z0-9]/gi, "") || "superadmin";

  await query(
    `insert into users (username, email, password_hash, name, phone, role, locked)
     values ($1,$2,$3,$4,$5,'superadmin', false)`,
    [username, email, passwordHash, name, phone]
  );

  // eslint-disable-next-line no-console
  console.log(`✅ Super admin created:\n  email: ${email}\n  password: ${password}\nChange the password after first login.`);
}

async function main() {
  // Make sure tables exist even if this is run before the server has ever
  // started (e.g. as a one-off Render job right after first deploy).
  await runMigrations();
  await ensureSuperAdmin();
  await pool.end();
}

const isMainModule = process.argv[1] && process.argv[1].endsWith("seedSuperadmin.js");
if (isMainModule) {
  main().catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to seed super admin:", err);
    await pool.end();
    process.exit(1);
  });
}
