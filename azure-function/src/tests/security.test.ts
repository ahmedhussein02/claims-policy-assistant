/**
 * Authorization / injection tests for the Claims API handlers. Hermetic: SQL and token validation are replaced
 * by fakes that behave like the real thing (ownership is decided by the user_id the BACKEND derives from the token).
 * Run: npm test
 */
import path from "node:path";
for (const [k, v] of Object.entries({
  SQL_CONNECTION_STRING: "x", ENTRA_ISSUER: "x", ENTRA_JWKS_URI: "https://x.com/k", ENTRA_AUDIENCE: "x",
})) process.env[k] ??= v;

let failed = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) { failed++; console.error(`FAIL  ${n}\n      got: ${JSON.stringify(got)}`); } };

// ---- fakes (installed in the module cache BEFORE the handlers are loaded) ----
const OIDS: Record<string, number> = { "oid-A": 1, "oid-B": 2 }; // oid -> user_id (Users table)
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const CLAIMS = [
  { claim_id: "CLM-001", user_id: 1, claim_type: "Auto", status: "Submitted", submitted_date: date("2026-09-29"), required_documents: "Police report; Repair estimate", next_step: "Wait", created_at: date("2026-09-29"), updated_at: date("2026-09-29") },
  { claim_id: "CLM-002", user_id: 1, claim_type: "Home", status: "Approved", submitted_date: date("2026-08-01"), required_documents: "None", next_step: "Paid", created_at: date("2026-08-01"), updated_at: date("2026-08-05") },
  { claim_id: "CLM-006", user_id: 2, claim_type: "Auto", status: "Submitted", submitted_date: date("2026-09-30"), required_documents: "None", next_step: "Wait", created_at: date("2026-09-30"), updated_at: date("2026-09-30") },
];
const calls: { sql: string; params: Record<string, unknown> }[] = [];
let dbError: Error | null = null;

const fakePool = {
  request() {
    const params: Record<string, unknown> = {};
    const req: any = {
      input(name: string, _type: unknown, value: unknown) { params[name] = value; return req; },
      async query(q: string) {
        const sqlText = q.replace(/\s+/g, " ").trim();
        calls.push({ sql: sqlText, params: { ...params } });
        if (dbError) throw dbError;
        if (sqlText.includes("FROM dbo.Users WHERE entra_object_id = @oid")) {
          const id = OIDS[String(params.oid)]; return { recordset: id ? [{ user_id: id }] : [] };
        }
        if (sqlText.includes("WHERE claim_id = @claimId AND user_id = @userId")) {
          return { recordset: CLAIMS.filter((c) => c.claim_id === params.claimId && c.user_id === params.userId) };
        }
        if (sqlText.includes("COUNT(*)")) {
          const mine = CLAIMS.filter((c) => c.user_id === params.userId && (!params.status || c.status === params.status));
          return { recordsets: [[{ total: mine.length }], mine] };
        }
        throw new Error("unexpected query: " + sqlText);
      },
    };
    return req;
  },
};

const resolve = (rel: string) => require.resolve(path.join(__dirname, rel));
require.cache[resolve("../utils/dbClient")] = { id: "db", filename: "db", loaded: true, exports: { getPool: async () => fakePool }, children: [], paths: [] } as any;
const realAuth = require(resolve("../middleware/auth"));
require.cache[resolve("../middleware/auth")]!.exports = {
  ...realAuth,
  authenticate: async (req: any) => { // stands in for real JWT validation: identity comes ONLY from the bearer token
    const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
    if (!m) throw new realAuth.AuthError(401, "Missing bearer token");
    return { oid: m[1], scopes: ["Claims.Read"] };
  },
};

const { getClaims } = require("../functions/getClaims");
const { getClaim } = require("../functions/getClaim");
const { withApi } = require("../utils/http");
const listApi = withApi(getClaims), detailApi = withApi(getClaim);
const ctx: any = { invocationId: "t", error() {}, log() {} };
const mk = (auth: string | undefined, query = "", params: Record<string, string> = {}) => ({
  headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? auth ?? null : null) },
  query: new URLSearchParams(query), params,
});
const json = (r: any) => JSON.stringify(r.jsonBody ?? {});

(async () => {
  // ---- authentication ----
  check("no token -> 401", (await detailApi(mk(undefined, "", { claimId: "CLM-001" }), ctx)).status === 401);
  check("list: no token -> 401", (await listApi(mk(undefined), ctx)).status === 401);
  let r = await listApi(mk("Bearer oid-unlinked"), ctx);
  check("valid token but no linked customer -> 403", r.status === 403 && r.jsonBody.error === "no_customer_profile", r);

  // ---- ownership ----
  r = await detailApi(mk("Bearer oid-A", "", { claimId: "CLM-001" }), ctx);
  check("owner can read own claim", r.status === 200 && r.jsonBody.claimId === "CLM-001", r);
  const other = await detailApi(mk("Bearer oid-A", "", { claimId: "CLM-006" }), ctx);
  const missing = await detailApi(mk("Bearer oid-A", "", { claimId: "CLM-999" }), ctx);
  check("user A cannot read user B's claim (403 Access denied)", other.status === 403 && other.jsonBody.error === "access_denied", other);
  check("other user's claim and nonexistent claim are indistinguishable (no ID enumeration)", other.status === missing.status && json(other) === json(missing), [other.jsonBody, missing.jsonBody]);
  check("no claim data leaks in the denial", !json(other).includes("Auto") && !json(other).includes("2026"), other.jsonBody);

  calls.length = 0;
  await detailApi(mk("Bearer oid-A", "", { claimId: "CLM-001" }), ctx);
  const detailQuery = calls.find((c) => c.sql.includes("FROM dbo.Claims"))!;
  check("claim lookup uses BOTH claim_id and user_id predicates", /claim_id = @claimId AND user_id = @userId/.test(detailQuery.sql), detailQuery.sql);
  check("user_id param comes from the token mapping (A -> 1)", detailQuery.params.userId === 1, detailQuery.params);

  // ---- client-supplied identity is ignored ----
  calls.length = 0;
  r = await listApi(mk("Bearer oid-A", "userId=2&user_id=2&oid=oid-B&owner=2"), ctx);
  const listQuery = calls.find((c) => c.sql.includes("COUNT(*)"))!;
  check("list returns only the caller's claims despite spoofed query params", r.status === 200 && r.jsonBody.items.every((c: any) => c.claimId !== "CLM-006") && r.jsonBody.totalItems === 2, r.jsonBody);
  check("SQL userId param is 1 (token), not 2 (query string)", listQuery.params.userId === 1, listQuery.params);
  r = await listApi(mk("Bearer oid-B"), ctx);
  check("user B sees only B's claims", r.jsonBody.items.length === 1 && r.jsonBody.items[0].claimId === "CLM-006", r.jsonBody);

  // ---- injection / validation (nothing may reach SQL) ----
  const bad: [string, any][] = [
    ["status injection", mk("Bearer oid-A", "status=Approved' OR 1=1--")],
    ["status unknown value", mk("Bearer oid-A", "status=Everything")],
    ["pageSize too large", mk("Bearer oid-A", "pageSize=100000")],
    ["pageSize zero", mk("Bearer oid-A", "pageSize=0")],
    ["page negative", mk("Bearer oid-A", "page=-1")],
    ["page not a number", mk("Bearer oid-A", "page=abc")],
    ["page fractional", mk("Bearer oid-A", "page=1.5")],
  ];
  for (const [name, req] of bad) {
    calls.length = 0;
    const res = await listApi(req, ctx);
    check(`list rejects ${name} (400) before any SQL`, res.status === 400 && calls.length === 0, { status: res.status, calls: calls.length });
  }
  for (const id of ["CLM-001' OR '1'='1", "CLM-001; DROP TABLE Claims--", "../../etc/passwd", "CLM-", "1", "CLM-0000000"]) {
    calls.length = 0;
    const res = await detailApi(mk("Bearer oid-A", "", { claimId: id }), ctx);
    check(`claim id "${id}" rejected (400) before any SQL`, res.status === 400 && calls.length === 0, { status: res.status, calls: calls.length });
  }
  r = await listApi(mk("Bearer oid-A", "status=approved&pageSize=1"), ctx);
  check("valid filters work (case-insensitive status, pageSize)", r.status === 200 && r.jsonBody.items.length === 1 && r.jsonBody.totalPages === 1 && r.jsonBody.items[0].status === "Approved", r.jsonBody);

  // ---- error handling never leaks internals ----
  dbError = Object.assign(new Error("Login failed for user 'secretadmin' at server hidden.database.windows.net"), { name: "RequestError" });
  r = await detailApi(mk("Bearer oid-A", "", { claimId: "CLM-001" }), ctx);
  check("DB failure -> generic 5xx, no internals", r.status >= 500 && !json(r).includes("secretadmin") && !json(r).includes("windows.net"), r);
  check("responses carry no-store + nosniff", r.headers["Cache-Control"] === "no-store" && r.headers["X-Content-Type-Options"] === "nosniff", r.headers);
  dbError = null;

  console.log(failed ? `\n${failed} FAILED` : "All Claims API security checks passed.");
  process.exit(failed ? 1 : 0);
})();
