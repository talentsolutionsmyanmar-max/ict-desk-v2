import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const sql = neon(process.env.DATABASE_URL);
  const schema = await readFile(
    new URL("./forward-schema.sql", import.meta.url),
    "utf8",
  );
  await sql.transaction(
    schema
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => sql.query(s)),
  );
  console.log("Forward journal tables initialized.");
}
main().catch(() => {
  console.error(
    "Forward store initialization failed; connection details withheld.",
  );
  process.exitCode = 1;
});
