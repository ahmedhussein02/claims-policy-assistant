import sql from "mssql";
import { getConfig } from "./config";

/** Azure SQL transient error numbers (incl. serverless auto-pause "40613"). */
const TRANSIENT_NUMBERS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4060, 10928, 10929]);
const TRANSIENT_CODES = new Set(["ETIMEOUT", "ESOCKET", "ECONNRESET"]);

function isTransient(err: any): boolean {
  const num = err?.number ?? err?.originalError?.info?.number;
  return TRANSIENT_NUMBERS.has(num) || TRANSIENT_CODES.has(err?.code);
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;

async function connectWithRetry(maxAttempts = 4): Promise<sql.ConnectionPool> {
  for (let attempt = 1; ; attempt++) {
    const pool = new sql.ConnectionPool(getConfig().SQL_CONNECTION_STRING);
    // If the pool later breaks, drop it so the next request reconnects.
    pool.on("error", () => {
      poolPromise = undefined;
    });
    try {
      return await pool.connect();
    } catch (err) {
      await pool.close().catch(() => undefined);
      if (attempt >= maxAttempts || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt)); // gives a paused DB time to resume
    }
  }
}

/** Shared, lazily created connection pool (one per Function host instance). */
export function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= connectWithRetry().catch((err) => {
    poolPromise = undefined;
    throw err;
  });
  return poolPromise;
}
