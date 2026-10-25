"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { ApiClientError, useApi, type ClaimDetail } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";

function Detail({ claimId }: { claimId: string }) {
  const api = useApi();
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api<ClaimDetail>(`/claims/${encodeURIComponent(claimId)}`, ctrl.signal)
      .then(setClaim)
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof ApiClientError ? e.message : "Unexpected error.");
      });
    return () => ctrl.abort();
  }, [api, claimId]);

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 shadow-xs">{error}</p>;
  if (!claim) return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-2.5 text-sm font-medium text-slate-500 bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-xs">
        <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
        Loading claim…
      </div>
    </div>
  );

  const row = "grid grid-cols-3 gap-4 border-b border-slate-100 py-3.5 text-sm items-center";
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-6 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Claim Details</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 tracking-tight">{claim.claimId}</h1>
        </div>
        <div>
          <StatusBadge status={claim.status} />
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <div className={row}>
          <span className="text-slate-500 font-medium">Type</span>
          <span className="col-span-2 font-semibold text-slate-900">{claim.claimType}</span>
        </div>
        <div className={row}>
          <span className="text-slate-500 font-medium">Submitted</span>
          <span className="col-span-2 text-slate-700">{claim.submittedDate}</span>
        </div>
        <div className={row}>
          <span className="text-slate-500 font-medium">Last updated</span>
          <span className="col-span-2 text-slate-700">{claim.updatedAt.slice(0, 10)}</span>
        </div>
        <div className={row}>
          <span className="text-slate-500 font-medium">Required documents</span>
          <span className="col-span-2 text-slate-700">
            {claim.requiredDocuments.length ? (
              <ul className="list-inside list-disc space-y-1 mt-1">
                {claim.requiredDocuments.map((d) => <li key={d} className="text-sm text-slate-700">{d}</li>)}
              </ul>
            ) : (
              <span className="text-slate-400 italic">None</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className="text-slate-500 font-medium">Next step</span>
          <span className="col-span-2 font-medium text-blue-600">{claim.nextStep}</span>
        </div>
      </div>
    </div>
  );
}

export default function ClaimPage() {
  const { claimId } = useParams<{ claimId: string }>();
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      <Link 
        href="/claims" 
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer group"
      >
        <span className="transition-transform group-hover:-translate-x-0.5">←</span> Back to claims
      </Link>
      <AuthenticatedTemplate><Detail claimId={claimId} /></AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-8 text-center">
          <p className="text-slate-600 text-sm">Please sign in to view this claim.</p>
        </div>
      </UnauthenticatedTemplate>
    </div>
  );
}