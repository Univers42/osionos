import { create } from "zustand";

export interface Toast {
  id: string;
  kind: "success" | "error" | "info" | "warning";
  title: string;
  description?: string;
  durationMs?: number | null;
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

function toastId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = toastId();
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-6) }));
    return id;
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  clear: () => set({ toasts: [] }),
}));
