import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Copy .env.example to .env");
}

export const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20
});
