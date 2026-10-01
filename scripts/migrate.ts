import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { readFile, readdir } from "node:fs/promises";
import { database, closeDatabase } from "../src/lib/db";
export async function migrate() {
  const db = database();
  await db.query(
    "CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  // Migrations are a startup/deployment command, never a public HTTP endpoint.
  for (const file of (await readdir("database"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const applied = await db.query(
      "SELECT name FROM migrations WHERE name=$1",
      [file],
    );
    if (applied.rows.length) {
      console.log(`Already applied: ${file}`);
      continue;
    }
    const sql = await readFile(`database/${file}`, "utf8");
    const pool = globalThis.queuePool!;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE migrations IN EXCLUSIVE MODE");
      if (
        !(
          await client.query("SELECT name FROM migrations WHERE name=$1", [
            file,
          ])
        ).rows.length
      ) {
        await client.query(sql);
        await client.query("INSERT INTO migrations(name) VALUES($1)", [file]);
      }
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("Database migrations complete.");
}
migrate()
  .then(closeDatabase)
  .catch(async () => {
    console.error(
      "Migration failed. Check DATABASE_URL, connectivity, and database permissions.",
    );
    await closeDatabase();
    process.exitCode = 1;
  });
