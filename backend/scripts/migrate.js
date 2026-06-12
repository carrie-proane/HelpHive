const fs = require("fs/promises");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.PGSSLMODE === "require"
        ? { rejectUnauthorized: false }
        : false
  });

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");

    for (const file of files) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE filename = $1", [file]);
      if (existing.rows.length) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
