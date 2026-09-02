/**
 * Runtime environment configuration.
 *
 * Follows the Kiosk mobile app's Architecture Decision 10: the environment is
 * named explicitly (`VITE_APP_ENV`) rather than inferred by comparing the
 * Supabase URL against a hardcoded value. The environment banner fails safe — it
 * shows unless `VITE_APP_ENV` is exactly "production".
 */
import { z } from 'zod';

const schema = z.object({
  VITE_APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  // Surface a clear message rather than a cryptic undefined-access later.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;

export const isProduction = env.VITE_APP_ENV === 'production';
