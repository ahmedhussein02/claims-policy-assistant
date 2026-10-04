import sql from "mssql";
import { getPool } from "../utils/dbClient";

export const CLAIM_STATUSES = ["Submitted", "In Review", "Action Required", "Approved", "Rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

interface ClaimRow {
  claim_id: string;
  claim_type: string;
  status: ClaimStatus;
  submitted_date: Date;
  required_documents?: string;
  next_step?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ClaimSummary {
  claimId: string;
  claimType: string;
  status: ClaimStatus;
  submittedDate: string; // YYYY-MM-DD
}

export interface ClaimDetail extends ClaimSummary {
  requiredDocuments: string[];
  nextStep: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

const toSummary = (r: ClaimRow): ClaimSummary => ({
  claimId: r.claim_id,
  claimType: r.claim_type,
  status: r.status,
  submittedDate: r.submitted_date.toISOString().slice(0, 10),
});

const toDetail = (r: ClaimRow): ClaimDetail => ({
  ...toSummary(r),
  requiredDocuments:
    !r.required_documents || r.required_documents === "None"
      ? []
      : r.required_documents.split(";").map((d) => d.trim()).filter(Boolean),
  nextStep: r.next_step ?? "",
  createdAt: r.created_at!.toISOString(),
  updatedAt: r.updated_at!.toISOString(),
});

/** Maps the validated token's Entra object id to our internal user_id (null if not linked). */
export async function resolveUserId(oid: string): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("oid", sql.UniqueIdentifier, oid)
    .query<{ user_id: number }>("SELECT user_id FROM dbo.Users WHERE entra_object_id = @oid");
  return result.recordset[0]?.user_id ?? null;
}

export interface ListOptions {
  page: number;
  pageSize: number;
  status?: ClaimStatus;
}

/** Lists ONLY the given user's claims. All values are bound parameters. */
export async function listClaims(userId: number, opts: ListOptions): Promise<Page<ClaimSummary>> {
  const pool = await getPool();
  // The WHERE fragment is a constant string chosen in code; user input is only ever bound as a parameter.
  const where = opts.status ? "user_id = @userId AND status = @status" : "user_id = @userId";

  const req = pool
    .request()
    .input("userId", sql.Int, userId)
    .input("offset", sql.Int, (opts.page - 1) * opts.pageSize)
    .input("pageSize", sql.Int, opts.pageSize);
  if (opts.status) req.input("status", sql.NVarChar(20), opts.status);

  const result = await req.query(`
    SELECT COUNT(*) AS total FROM dbo.Claims WHERE ${where};
    SELECT claim_id, claim_type, status, submitted_date
    FROM dbo.Claims
    WHERE ${where}
    ORDER BY submitted_date DESC, claim_id DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
  `);

  const sets = result.recordsets as unknown as any[][];
  const totalItems: number = sets[0][0].total;
  return {
    items: (sets[1] as ClaimRow[]).map(toSummary),
    page: opts.page,
    pageSize: opts.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / opts.pageSize),
  };
}

/** Fetches a claim by BOTH claim id and owner. Returns null if it isn't this user's claim. */
export async function getClaimForUser(userId: number, claimId: string): Promise<ClaimDetail | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("claimId", sql.NVarChar(20), claimId)
    .input("userId", sql.Int, userId)
    .query<ClaimRow>(`
      SELECT claim_id, claim_type, status, submitted_date, required_documents, next_step, created_at, updated_at
      FROM dbo.Claims
      WHERE claim_id = @claimId AND user_id = @userId
    `);
  const row = result.recordset[0];
  return row ? toDetail(row) : null;
}
