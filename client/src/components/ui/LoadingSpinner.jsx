import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ text = 'Loading data...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center text-slate-500 dark:text-slate-400 ${className}`}>
      <Loader2 className="w-7 h-7 animate-spin text-brand-600 dark:text-brand-400 mb-2" />
      <span className="text-xs font-medium">{text}</span>
    </div>
  );
}

export default LoadingSpinner;
