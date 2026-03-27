import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load .env from packages/api/ regardless of cwd
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const envSchema = z.object({
  ENTRA_CLIENT_ID: z.string(),
  ENTRA_TENANT_ID: z.string().default("common"),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().default("gpt-5.4-nano"),
});

export const config = envSchema.parse(process.env);
