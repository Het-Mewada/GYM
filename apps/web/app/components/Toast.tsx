'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, options?: { title?: string; duration?: number }) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: () => {},
      removeToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {}
    };
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', options?: { title?: string; duration?: number }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const duration = options?.duration ?? 4000;

      const newToast: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        duration
      };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, 'success', { title, duration });
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, 'error', { title, duration });
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string, duration?: number) => {
      showToast(message, 'info', { title, duration });
    },
    [showToast]
  );

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      removeToast,
      success,
      error,
      info
    }),
    [toasts, showToast, removeToast, success, error, info]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onRemove
}: {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.type}`}
          className={`pointer-events-auto relative overflow-hidden flex items-start gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${
            toast.type === 'success'
              ? 'bg-neutral-900/95 border-emerald-500/40 shadow-emerald-950/40 text-neutral-100'
              : toast.type === 'error'
              ? 'bg-neutral-900/95 border-red-500/40 shadow-red-950/40 text-neutral-100'
              : 'bg-neutral-900/95 border-neutral-700 shadow-black/60 text-neutral-100'
          }`}
        >
          {/* Icon */}
          {toast.type === 'success' && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          )}
          {toast.type === 'error' && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-950/80 border border-red-500/40 text-red-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
          )}
          {(toast.type === 'info' || toast.type === 'warning') && (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-800 border border-neutral-600 text-neutral-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
          )}

          {/* Text Content */}
          <div className="flex-1 min-w-0 pt-0.5">
            {toast.title && (
              <div className="text-xs font-semibold text-white tracking-wide mb-0.5">
                {toast.title}
              </div>
            )}
            <div className="text-xs text-neutral-200 leading-relaxed font-medium break-words">
              {toast.message}
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={() => onRemove(toast.id)}
            className="shrink-0 p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
            aria-label="Close notification"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Animated Countdown Bar */}
          {Boolean(toast.duration && toast.duration > 0) && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-neutral-800/80">
              <div
                className={`h-full ${
                  toast.type === 'success'
                    ? 'bg-emerald-400'
                    : toast.type === 'error'
                    ? 'bg-red-400'
                    : 'bg-neutral-400'
                }`}
                style={{
                  animation: `toast-progress ${toast.duration}ms linear forwards`
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
