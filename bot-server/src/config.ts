import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  ALLOWED_ORIGIN: z.string().default("http://localhost:3000"),

  ENTRA_TENANT_ID: z.string().default(""),
  ENTRA_ISSUER: z.string().min(1),
  ENTRA_JWKS_URI: z.string().url(),
  ENTRA_AUDIENCE: z.string().min(1),
  ENTRA_REQUIRED_SCOPE: z.string().default("Claims.Read"),

  CLAIMS_API_BASE_URL: z.string().url(),

  OPENAI_API_KEY: z.string().min(1),
  CHAT_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),

  SEARCH_ENDPOINT: z.string().url(),
  SEARCH_API_KEY: z.string().min(1),
  SEARCH_INDEX_NAME: z.string().default("policy-chunks"),

  RAG_TOP_K: z.coerce.number().int().positive().default(5),
  RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.35), // cosine similarity gate (see docs/rag-design.md)
  SEARCH_USE_SEMANTIC: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  SEARCH_SEMANTIC_CONFIG: z.string().default("policy-semantic"),
  CHUNK_SIZE_TOKENS: z.coerce.number().default(400),
  CHUNK_OVERLAP_TOKENS: z.coerce.number().default(60),
  FALLBACK_MESSAGE: z
    .string()
    .default("I don't have sufficient information to answer this request. Please contact support."),

  BLOB_CONNECTION_STRING: z.string().default(""),
  BLOB_CONTAINER: z.string().default("policies"),

  SQL_CONNECTION_STRING: z.string().min(1),

  // Abuse / cost protection for POST /chat
  CHAT_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(15), // per signed-in user
  CHAT_DAILY_LIMIT: z.coerce.number().int().positive().default(200), // per signed-in user (caps OpenAI spend)
  IP_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120), // per IP, applied before auth
  CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0), // number of reverse-proxy hops (1 on Azure App Service)
});

export type Config = z.infer<typeof schema>;

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast; list variable names only, never values.
  const missing = parsed.error.issues.map((i) => i.path.join("."));
  console.error("Invalid configuration. Check these env vars:", missing.join(", "));
  process.exit(1);
}
export const config: Config = parsed.data;
