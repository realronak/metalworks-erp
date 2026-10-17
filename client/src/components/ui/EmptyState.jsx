import React from 'react';

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

export default EmptyState;
