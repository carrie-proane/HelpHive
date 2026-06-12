const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

for (const envFilePath of [
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env")
]) {
  if (fsSync.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath, override: false });
  }
}

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
