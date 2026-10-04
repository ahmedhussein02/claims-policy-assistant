import { z } from "zod";

const schema = z.object({
  SQL_CONNECTION_STRING: z.string().min(1),
  ENTRA_ISSUER: z.string().min(1),
  ENTRA_JWKS_URI: z.string().url(),
  ENTRA_AUDIENCE: z.string().min(1),
  ENTRA_REQUIRED_SCOPE: z.string().default("Claims.Read"),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(50),
  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
});

export type FunctionConfig = z.infer<typeof schema>;

let cached: FunctionConfig | undefined;
/** Lazy + cached so a missing var yields a clear error at first request, not at import. */
export function getConfig(): FunctionConfig {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
