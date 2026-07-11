import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./supabase/migrations",
  // Only needed for `drizzle-kit push/migrate` — `generate` works offline.
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Don't touch Supabase-managed roles on push.
  entities: { roles: { provider: "supabase" } },
});
