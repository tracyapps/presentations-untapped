import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

// drizzle-kit runs outside Next.js, so it does not load .env.local unless we
// do it explicitly. Keeping the same loader as the app also preserves Next's
// normal environment-file precedence across local development and CI.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
