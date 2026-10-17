import React from 'react';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend, // { value: '+12%', isPositive: true }
  variant = 'default', // 'default', 'success', 'warning', 'danger'
  onClick,
  className = ''
}) {
  const iconVariants = {
    default: 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400 border-brand-200/50 dark:border-brand-800/40',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40',
    danger: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/40'
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-all ${
        onClick ? 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </span>
        {Icon && (
          <div className={`p-2 rounded-lg border ${iconVariants[variant]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono">
          {value}
        </span>
        {trend && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              trend.isPositive === true
                ? 'text-emerald-600 dark:text-emerald-400'
                : trend.isPositive === false
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500'
            }`}
          >
            {trend.isPositive === true ? (
              <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
            ) : trend.isPositive === false ? (
              <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
            ) : (
              <Minus className="w-3.5 h-3.5 mr-0.5" />
            )}
            {trend.value}
          </span>
        )}
      </div>

      {subtitle && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title = 'No records found',
  description = 'There is currently no data to display for this view.',
  action,
  className = ''
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl ${className}`}>
      {Icon && (
        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 mb-3">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4">
        {description}
      </p>
      {action}
    </div>
  );
}

export function LoadingSpinner({ text = 'Loading data...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center text-slate-500 dark:text-slate-400 ${className}`}>
      <Loader2 className="w-7 h-7 animate-spin text-brand-600 dark:text-brand-400 mb-2" />
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}

export default KpiCard;

