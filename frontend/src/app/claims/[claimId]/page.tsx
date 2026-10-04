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

  if (error) return <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!claim) return <p className="text-gray-500">Loading claim…</p>;

  const row = "grid grid-cols-3 gap-2 border-b py-2 text-sm";
  return (
    <div className="rounded border bg-white p-5">
      <h1 className="mb-3 flex items-center gap-3 text-xl font-semibold">{claim.claimId} <StatusBadge status={claim.status} /></h1>
      <div className={row}><span className="text-gray-500">Type</span><span className="col-span-2">{claim.claimType}</span></div>
      <div className={row}><span className="text-gray-500">Submitted</span><span className="col-span-2">{claim.submittedDate}</span></div>
      <div className={row}><span className="text-gray-500">Last updated</span><span className="col-span-2">{claim.updatedAt.slice(0, 10)}</span></div>
      <div className={row}>
        <span className="text-gray-500">Required documents</span>
        <span className="col-span-2">{claim.requiredDocuments.length ? (
          <ul className="list-inside list-disc">{claim.requiredDocuments.map((d) => <li key={d}>{d}</li>)}</ul>
        ) : "None"}</span>
      </div>
      <div className={row}><span className="text-gray-500">Next step</span><span className="col-span-2">{claim.nextStep}</span></div>
    </div>
  );
}

export default function ClaimPage() {
  const { claimId } = useParams<{ claimId: string }>();
  return (
    <>
      <Link href="/claims" className="mb-4 inline-block text-sm text-blue-700 hover:underline">← Back to claims</Link>
      <AuthenticatedTemplate><Detail claimId={claimId} /></AuthenticatedTemplate>
      <UnauthenticatedTemplate><p className="text-gray-600">Please sign in to view this claim.</p></UnauthenticatedTemplate>
    </>
  );
}
