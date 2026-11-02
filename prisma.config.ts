import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prefer DIRECT_URL for CLI (migrate / db push). Supabase's transaction
// pooler on :6543 is for the running app, not for schema changes.
const cliUrl = process.env["DIRECT_URL"] || process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliUrl!,
  },
});
