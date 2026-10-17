import React from 'react';

export function Badge({ children, variant = 'default', size = 'sm', className = '' }) {
  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  const getVariantClasses = (type) => {
    switch (type.toLowerCase()) {
      // Success states
      case 'completed':
      case 'passed':
      case 'resolved':
      case 'paid':
      case 'delivered':
      case 'active':
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60';

      // Info / Progress
      case 'approved':
      case 'confirmed':
      case 'released':
      case 'shipped':
      case 'info':
        return 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/60';

      // In progress / partial
      case 'in_progress':
      case 'in_production':
      case 'partially_received':
      case 'partially_delivered':
      case 'partially_paid':
      case 'under_review':
      case 'conditional':
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60';

      // Danger / Critical / Failed
      case 'cancelled':
      case 'failed':
      case 'critical':
      case 'unpaid':
      case 'rejected':
      case 'danger':
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60';

      // High / urgent priority
      case 'urgent':
        return 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60';

      // Neutral / Draft
      case 'draft':
      case 'quotation':
      case 'planned':
      case 'pending':
      case 'minor':
      case 'low':
      case 'medium':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const formattedLabel = typeof children === 'string'
    ? children.replace(/_/g, ' ')
    : children;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border capitalize ${sizeClasses[size]} ${getVariantClasses(variant)} ${className}`}
    >
      {formattedLabel}
    </span>
  );
}

export default Badge;
