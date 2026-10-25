interface Props { page: number; totalPages: number; totalItems: number; onChange: (page: number) => void; disabled?: boolean }

export default function Pagination({ page, totalPages, totalItems, onChange, disabled }: Props) {
  const btn = "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white";
  return (
    <nav className="flex items-center justify-between pt-4" aria-label="Pagination">
      <span className="text-sm text-slate-500 font-medium">
        {totalItems} claim{totalItems === 1 ? "" : "s"} · Page {page} of {Math.max(totalPages, 1)}
      </span>
      <div className="flex gap-2">
        <button 
          className={btn} 
          disabled={disabled || page <= 1} 
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <button 
          className={btn} 
          disabled={disabled || page >= totalPages} 
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}