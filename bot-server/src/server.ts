import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { z } from "zod";
import { config } from "./config";
import { authenticate, AuthError, type AuthInfo } from "./middleware/auth";
import { handleChat, type ChatOutcome } from "./bot";
import { ClaimsApiError } from "./services/claimsService";
import { buildRecord, logInteraction, type InteractionRecord } from "./services/observabilityService";

const bodySchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(1000, "Message is too long (max 1000 characters)"),
  conversationId: z.string().uuid().optional(),
});

export interface AppDeps {
  authenticate: (authorization: string | undefined) => Promise<AuthInfo>;
  handle: (input: { message: string; token: string; conversationId: string; oid: string }) => Promise<ChatOutcome>;
  /** Fire-and-forget observability hook; must never affect the response. */
  log?: (record: InteractionRecord) => void;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.ALLOWED_ORIGIN }));
  app.use(express.json({ limit: "8kb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.post("/chat", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = await deps.authenticate(req.header("authorization")); // 401/403 before anything else
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_request", message: parsed.error.issues[0]?.message ?? "Invalid request" });
      }
      const conversationId = parsed.data.conversationId ?? crypto.randomUUID();
      const started = Date.now();
      const outcome = await deps.handle({ message: parsed.data.message, token: auth.token, oid: auth.oid, conversationId });
      res.set("Cache-Control", "no-store").json(outcome.response);
      try { // after the reply is sent: logging can't slow or break the chat
        deps.log?.(buildRecord({ conversationId, oid: auth.oid, message: parsed.data.message, outcome, totalMs: Date.now() - started }));
      } catch (e) { console.warn("observability hook failed:", (e as Error)?.message); }
    } catch (e) {
      next(e);
    }
  });

  // Uniform, non-leaky error handling.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.status === 401 ? "unauthorized" : "forbidden", message: err.message });
    }
    if (err instanceof ClaimsApiError && err.status === 401) {
      return res.status(401).json({ error: "unauthorized", message: "Your session expired. Please sign in again." });
    }
    if ((err as { type?: string })?.type === "entity.parse.failed") {
      return res.status(400).json({ error: "invalid_request", message: "Malformed JSON body" });
    }
    if ((err as { type?: string })?.type === "entity.too.large") {
      return res.status(413).json({ error: "payload_too_large", message: "Request is too large" });
    }
    console.error("Unhandled error:", (err as Error)?.name, (err as Error)?.message);
    res.status(500).json({ error: "internal_error", message: "An unexpected error occurred." });
  });
  return app;
}

if (require.main === module) {
  createApp({ authenticate, handle: (i) => handleChat(i), log: (r) => void logInteraction(r) }).listen(config.PORT, () =>
    console.log(`bot-server listening on :${config.PORT}`)
  );
}
