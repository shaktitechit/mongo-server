"use client";

import React from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  isDanger?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm Action",
  isDanger = true,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="glass-panel max-w-md w-full p-6 rounded-2xl space-y-4 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                isDanger
                  ? "bg-rose-500/10 border border-rose-500/20 text-rose-400"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-400"
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed font-sans">{message}</p>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800/80 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-all ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500 shadow-rose-950/40"
                : "bg-amber-600 hover:bg-amber-500 shadow-amber-950/40"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
