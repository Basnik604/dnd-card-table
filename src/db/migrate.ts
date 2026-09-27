import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "./client.js";

const dir = resolve("db/migrations");
const files = (await readdir(dir))
  .filter((name) => /^\d+_.*\.sql$/i.test(name))
  .sort();

for (const file of files) {
  const migration = await readFile(resolve(dir, file), "utf8");
  await sql.unsafe(migration);
  console.log(`Migration ${file} applied.`);
}

await sql.end();
