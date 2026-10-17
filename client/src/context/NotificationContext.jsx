import React, { createContext, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 5);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const notify = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 5000),
    warning: (msg) => addToast(msg, 'warning', 4500),
    info: (msg) => addToast(msg, 'info')
  };

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {/* Toast Overlay Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border text-sm transition-all transform animate-in slide-in-from-bottom-5 duration-200 ${
                isSuccess
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-100 dark:border-emerald-800'
                  : isError
                  ? 'bg-rose-50 text-rose-950 border-rose-200 dark:bg-rose-950/80 dark:text-rose-100 dark:border-rose-800'
                  : isWarning
                  ? 'bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-800'
                  : 'bg-white text-slate-900 border-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                {isError && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
              </div>
              <div className="flex-1 leading-snug">{toast.message}</div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
