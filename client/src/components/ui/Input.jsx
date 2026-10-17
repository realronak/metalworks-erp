import React from 'react';

export function Input({
  label,
  error,
  helperText,
  className = '',
  id,
  type = 'text',
  required,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        required={required}
        className={`w-full rounded-md border text-sm px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
          error
            ? 'border-rose-400 dark:border-rose-600 focus:ring-rose-500'
            : 'border-slate-300 dark:border-slate-700'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}

export function Select({
  label,
  error,
  helperText,
  children,
  className = '',
  id,
  required,
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        className={`w-full rounded-md border text-sm px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
          error
            ? 'border-rose-400 dark:border-rose-600 focus:ring-rose-500'
            : 'border-slate-300 dark:border-slate-700'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}

export default Input;

