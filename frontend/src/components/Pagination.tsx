interface Props { page: number; totalPages: number; totalItems: number; onChange: (page: number) => void; disabled?: boolean }

export default function Pagination({ page, totalPages, totalItems, onChange, disabled }: Props) {
  const btn = "rounded border px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <nav className="flex items-center justify-between pt-4" aria-label="Pagination">
      <span className="text-sm text-gray-500">{totalItems} claim{totalItems === 1 ? "" : "s"} · Page {page} of {Math.max(totalPages, 1)}</span>
      <div className="flex gap-2">
        <button className={btn} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <button className={btn} disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
