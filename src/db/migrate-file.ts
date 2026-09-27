import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "./client.js";

const file = process.argv[2];
if (!file) throw new Error("Usage: tsx src/db/migrate-file.ts <migration.sql>");
const migration = await readFile(resolve(file), "utf8");
await sql.unsafe(migration);
console.log(`Migration ${file} applied.`);
await sql.end();
