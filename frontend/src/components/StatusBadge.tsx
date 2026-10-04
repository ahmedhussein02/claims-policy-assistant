import type { ClaimStatus } from "@/lib/api";

const STYLES: Record<ClaimStatus, string> = {
  Submitted: "bg-gray-100 text-gray-700",
  "In Review": "bg-blue-100 text-blue-800",
  "Action Required": "bg-amber-100 text-amber-800",
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
};

export default function StatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>{status}</span>;
}
