import sql from "mssql";
import { config } from "../config";
import type { ChatOutcome } from "../bot";

export interface InteractionRecord {
  conversationId: string;
  oid: string; // resolved to user_id inside the INSERT; the token itself is never stored
  query: string;
  intent: string | null;
  retrievalResults: string | null; // JSON: [{source, chunk_id, score}]
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  retrievalLatencyMs: number | null;
  generationLatencyMs: number | null;
  response: string;
  status: "success" | "fallback" | "error";
  errorType: string | null;
}

const MAX_QUERY = 2000;
const MAX_RESPONSE = 8000;

/**
 * Pure mapping from a chat outcome to a log row (unit-tested).
 * Privacy: claim answers contain personal claim data, so their text is not stored; policy answers are public content.
 * error_type carries the error class, the RAG fallback reason, or the routing reason for refusals.
 */
export function buildRecord(input: { conversationId: string; oid: string; message: string; outcome: ChatOutcome; totalMs: number }): InteractionRecord {
  const { outcome, message } = input;
  const { trace, response } = outcome;
  const rag = trace.rag;
  return {
    conversationId: input.conversationId,
    oid: input.oid,
    query: message.slice(0, MAX_QUERY),
    intent: trace.intent ?? null,
    retrievalResults: rag?.retrieved ? JSON.stringify(rag.retrieved) : null,
    model: rag && (rag.promptTokens !== undefined || rag.generationMs > 0) ? rag.model : null,
    promptTokens: rag?.promptTokens ?? null,
    completionTokens: rag?.completionTokens ?? null,
    latencyMs: Math.round(input.totalMs),
    retrievalLatencyMs: rag ? Math.round(rag.retrievalMs) : null,
    generationLatencyMs: rag ? Math.round(rag.generationMs) : null,
    response: (trace.intent === "CLAIM_QUERY" ? "[claim details not logged]" : response.answer).slice(0, MAX_RESPONSE),
    status: trace.status ?? "success",
    errorType: trace.errorType ?? rag?.fallbackReason ?? (trace.status === "fallback" ? trace.routeReason ?? null : null),
  };
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;
function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= (async () => {
    const pool = new sql.ConnectionPool(config.SQL_CONNECTION_STRING);
    pool.on("error", () => { poolPromise = undefined; });
    return pool.connect();
  })().catch((e) => { poolPromise = undefined; throw e; });
  return poolPromise;
}

export type Executor = (r: InteractionRecord) => Promise<void>;

const insertRow: Executor = async (r) => {
  const pool = await getPool();
  await pool
    .request()
    .input("conversationId", sql.NVarChar(64), r.conversationId)
    .input("oid", sql.UniqueIdentifier, r.oid)
    .input("query", sql.NVarChar(MAX_QUERY), r.query)
    .input("intent", sql.NVarChar(20), r.intent)
    .input("retrieval", sql.NVarChar(sql.MAX), r.retrievalResults)
    .input("model", sql.NVarChar(100), r.model)
    .input("promptTokens", sql.Int, r.promptTokens)
    .input("completionTokens", sql.Int, r.completionTokens)
    .input("latency", sql.Int, r.latencyMs)
    .input("retrievalLatency", sql.Int, r.retrievalLatencyMs)
    .input("generationLatency", sql.Int, r.generationLatencyMs)
    .input("response", sql.NVarChar(sql.MAX), r.response)
    .input("status", sql.NVarChar(20), r.status)
    .input("errorType", sql.NVarChar(100), r.errorType)
    .query(`
      INSERT INTO dbo.AiInteractions
        (conversation_id, user_id, query, intent, retrieval_results, model, prompt_tokens, completion_tokens,
         latency_ms, retrieval_latency_ms, generation_latency_ms, response, status, error_type)
      VALUES
        (@conversationId, (SELECT user_id FROM dbo.Users WHERE entra_object_id = @oid), @query, @intent, @retrieval, @model,
         @promptTokens, @completionTokens, @latency, @retrievalLatency, @generationLatency, @response, @status, @errorType)
    `);
};

/** Never throws and never blocks a chat reply for long: failures and slow writes are dropped with a warning. */
export async function logInteraction(record: InteractionRecord, exec: Executor = insertRow, timeoutMs = 8000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      exec(record),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("log write timed out")), timeoutMs); }),
    ]);
    return true;
  } catch (e) {
    console.warn("observability: interaction log dropped:", (e as Error)?.message);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
