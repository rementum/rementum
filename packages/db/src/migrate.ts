import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.OWL_DATABASE_ADMIN_URL ?? process.env.OWL_DATABASE_URL;
if (!url) throw new Error("OWL_DATABASE_ADMIN_URL or OWL_DATABASE_URL is required");

const directory = path.resolve(import.meta.dirname, "../migrations");
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS owl_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set(
    (await sql<{ name: string }[]>`SELECT name FROM owl_migrations`).map((row) => row.name),
  );
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const migration = await readFile(path.join(directory, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO owl_migrations (name) VALUES (${file})`;
    });
    process.stdout.write(`Applied ${file}\n`);
  }
} finally {
  await sql.end();
}
