"use client";

import React, { useState, useEffect } from "react";
import { Edit3, Plus, Check, AlertCircle, FileCode } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (docJson: string, isEdit: boolean) => Promise<void>;
  initialDoc: any | null;
  collectionName: string;
}

export default function DocumentEditorModal({
  isOpen,
  onClose,
  onSave,
  initialDoc,
  collectionName,
}: Props) {
  const [content, setContent] = useState("");
  const [isValidJson, setIsValidJson] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialDoc) {
      setContent(JSON.stringify(initialDoc, null, 2));
    } else {
      setContent(
        JSON.stringify(
          {
            name: "Example Item",
            status: "active",
            createdAt: { "$date": new Date().toISOString() },
          },
          null,
          2
        )
      );
    }
    setIsValidJson(true);
    setJsonError(null);
  }, [initialDoc, isOpen]);

  const handleChange = (val: string) => {
    setContent(val);
    try {
      JSON.parse(val);
      setIsValidJson(true);
      setJsonError(null);
    } catch (e: any) {
      setIsValidJson(false);
      setJsonError(e.message);
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      setIsValidJson(true);
      setJsonError(null);
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!isValidJson) return;
    setLoading(true);
    try {
      await onSave(content, !!initialDoc);
      onClose();
    } catch (err: any) {
      setJsonError(err.message || "Failed to save document");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel max-w-2xl w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-white font-bold">
            {initialDoc ? <Edit3 className="w-5 h-5 text-amber-400" /> : <Plus className="w-5 h-5 text-emerald-400" />}
            <h3>{initialDoc ? `Edit Document in '${collectionName}'` : `Insert Document into '${collectionName}'`}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Specify document payload in Extended JSON (EJSON) format:</span>
          <button
            type="button"
            onClick={handleFormat}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 font-mono text-[11px]"
          >
            <FileCode className="w-3.5 h-3.5 text-cyan-400" /> Prettify JSON
          </button>
        </div>

        <div className="relative flex-1 min-h-[300px]">
          <textarea
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            className={`w-full h-full min-h-[300px] bg-slate-950 border ${
              isValidJson ? "border-slate-800 focus:border-emerald-500" : "border-rose-500/80 focus:border-rose-500"
            } rounded-lg p-4 font-mono text-xs text-slate-100 focus:outline-none resize-none leading-relaxed`}
            spellCheck={false}
          />
        </div>

        {jsonError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{jsonError}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValidJson || loading}
            className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
          >
            <Check className="w-4 h-4" />
            {loading ? "Saving..." : initialDoc ? "Update Document" : "Insert Document"}
          </button>
        </div>
      </div>
    </div>
  );
}
