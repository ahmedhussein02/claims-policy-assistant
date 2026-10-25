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

  const select = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer";
  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden p-6 space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-6 text-sm pb-4 border-b border-slate-100">
        <label className="flex items-center gap-2 font-medium text-slate-700">
          Status:
          <select className={select} value={status} onChange={(e) => { setStatus(e.target.value as ClaimStatus | ""); setPage(1); }}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-700">
          Per page:
          <select className={select} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-xs">{error}</p>}

      {!error && (
        <div className={loading ? "opacity-50 transition-opacity" : ""} aria-busy={loading}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-3.5">Claim</th>
                  <th className="px-6 py-3.5">Type</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {data?.items.map((c) => (
                  <tr key={c.claimId} className="hover:bg-slate-50/80 transition-colors duration-150">
                    <td className="px-6 py-4">
                      <Link className="font-bold text-blue-600 hover:text-blue-800 transition-colors" href={`/claims/${c.claimId}`}>
                        {c.claimId}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{c.claimType}</td>
                    <td className="px-6 py-4"><StatusBadge status={c.status} /></td>
                    <td className="px-6 py-4 text-slate-500">{c.submittedDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loading && !data && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-500 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                Loading claims…
              </div>
            </div>
          )}
          {data && data.items.length === 0 && <p className="py-8 text-center text-slate-500 text-sm">No claims match this filter.</p>}
          {data && (
            <div className="pt-4 border-t border-slate-100 mt-4">
              <Pagination page={data.page} totalPages={data.totalPages} totalItems={data.totalItems} onChange={setPage} disabled={loading} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}