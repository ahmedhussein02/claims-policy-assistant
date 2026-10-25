import type { ClaimStatus } from "@/lib/api";

const STYLES: Record<ClaimStatus, string> = {
  Submitted: "bg-slate-100 text-slate-700 border-slate-200/80",
  "In Review": "bg-blue-50 text-blue-700 border-blue-200/80",
  "Action Required": "bg-amber-50 text-amber-700 border-amber-200/80",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200/80",
};

const DOT_STYLES: Record<ClaimStatus, string> = {
  Submitted: "bg-slate-400",
  "In Review": "bg-blue-500",
  "Action Required": "bg-amber-500",
  Approved: "bg-emerald-500",
  Rejected: "bg-rose-500",
};

export default function StatusBadge({ status }: { status: ClaimStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border shadow-2xs ${STYLES[status] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_STYLES[status] || "bg-slate-500"} animate-pulse`} />
      {status}
    </span>
  );
}