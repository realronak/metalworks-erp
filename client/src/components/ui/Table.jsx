import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Table({ children, className = '' }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-left text-sm border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '' }) {
  return (
    <thead className={`border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = '' }) {
  return (
    <tbody className={`divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300 ${className}`}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = '', hover = true, ...props }) {
  return (
    <tr
      className={`transition-colors ${
        hover ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({ children, className = '', ...props }) {
  return (
    <th className={`px-4 py-3 font-semibold ${className}`} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = '', ...props }) {
  return (
    <td className={`px-4 py-3 align-middle ${className}`} {...props}>
      {children}
    </td>
  );
}

export function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 20,
  onPageChange
}) {
  if (totalPages <= 1 && totalItems === 0) return null;

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
      <div>
        Showing <span className="font-medium text-slate-700 dark:text-slate-200">{startItem}</span> to{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{endItem}</span> of{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{totalItems}</span> results
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
          Page {currentPage} of {totalPages || 1}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
