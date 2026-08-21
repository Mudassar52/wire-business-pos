import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// schema.sql only uses `create table if not exists` / `create index if not
// exists`, so running it again on every server start is always safe — it
// will never drop or overwrite existing data, it just makes sure every
// table/index the app needs actually exists.
export async function runMigrations() {
  const schemaPath = path.join(__dirname, "..", "..", "sql", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  // eslint-disable-next-line no-console
  console.log("Applying sql/schema.sql to database...");
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log("✅ Schema is up to date.");
}

// Allows `npm run migrate` to also be run by hand if ever needed.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  runMigrations()
    .then(async () => {
      await pool.end();
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("❌ Migration failed:", err);
      process.exit(1);
    });
}
