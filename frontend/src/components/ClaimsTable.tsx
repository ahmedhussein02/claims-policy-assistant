"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiClientError, STATUSES, useApi, type ClaimStatus, type ClaimSummary, type Page } from "@/lib/api";
import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";

const PAGE_SIZES = [3, 5, 10];

export default function ClaimsTable() {
  const api = useApi();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [status, setStatus] = useState<ClaimStatus | "">("");
  const [data, setData] = useState<Page<ClaimSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const key = `${page}|${pageSize}|${status}`;
  const loading = loadedKey !== key; // derived: true until the response for the current params arrives

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set("status", status);
    api<Page<ClaimSummary>>(`/claims?${qs}`, ctrl.signal)
      .then((d) => { setData(d); setError(null); setLoadedKey(key); })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof ApiClientError ? e.message : "Unexpected error.");
        setLoadedKey(key);
      });
    return () => ctrl.abort();
  }, [api, key, page, pageSize, status]);

  const select = "rounded border bg-white px-2 py-1 text-sm";
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label>Status{" "}
          <select className={select} value={status} onChange={(e) => { setStatus(e.target.value as ClaimStatus | ""); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Per page{" "}
          <select className={select} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!error && (
        <div className={loading ? "opacity-50 transition-opacity" : ""} aria-busy={loading}>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b text-gray-500">
              <tr><th className="py-2">Claim</th><th>Type</th><th>Status</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {data?.items.map((c) => (
                <tr key={c.claimId} className="border-b hover:bg-gray-50">
                  <td className="py-2"><Link className="text-blue-700 hover:underline" href={`/claims/${c.claimId}`}>{c.claimId}</Link></td>
                  <td>{c.claimType}</td><td><StatusBadge status={c.status} /></td><td>{c.submittedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data && <p className="py-6 text-gray-500">Loading claims…</p>}
          {data && data.items.length === 0 && <p className="py-6 text-gray-500">No claims match this filter.</p>}
          {data && <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalItems} onChange={setPage} disabled={loading} />}
        </div>
      )}
    </section>
  );
}
