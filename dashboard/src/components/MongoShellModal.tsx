"use client";

import React, { useState } from "react";
import { Terminal, Play, Clock, AlertCircle, Copy, Check, Sparkles } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  database: string;
}

export default function MongoShellModal({ isOpen, onClose, database }: Props) {
  const [code, setCode] = useState(`db.opms.find({ status: "active" })`);
  const [output, setOutput] = useState<any | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [
    { label: "Find Documents", code: `db.opms.find({ status: "active" })` },
    { label: "Aggregate Pipeline", code: `db.opms.aggregate([{ $match: { status: "active" } }, { $count: "total" }])` },
    { label: "Count Documents", code: `db.opms.count({})` },
    { label: "DB Stats", code: `db.stats()` },
    { label: "Raw JSON Command", code: `{\n  "dbStats": 1\n}` },
  ];

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setOutput(null);
    setExecutionTime(null);

    try {
      const res = await fetch(`/api/databases/${database}/shell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }).then((r) => r.json());

      if (res.success) {
        setOutput(res.result);
        setExecutionTime(res.executionTimeMs);
      } else {
        setError(res.error || "Execution failed");
      }
    } catch (err: any) {
      setError(err.message || "Failed to execute query");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(JSON.stringify(output, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="glass-panel max-w-4xl w-full p-6 rounded-2xl space-y-4 border border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Interactive Mongo Shell & Query Executor</h3>
              <p className="text-xs text-slate-400">Database: <span className="text-emerald-400 font-mono font-semibold">{database}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white font-bold">
            ✕
          </button>
        </div>

        {/* Preset Snippets */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs text-slate-400 flex items-center gap-1 font-medium shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Presets:
          </span>
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setCode(p.code)}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 shrink-0 transition-all"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Code Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Enter query (mongosh syntax or raw JSON command):</span>
            {executionTime !== null && (
              <span className="text-emerald-400 font-mono text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Executed in {executionTime} ms
              </span>
            )}
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-32 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:outline-none resize-none leading-relaxed"
            spellCheck={false}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Supports find(), aggregate(), count(), stats(), & EJSON commands</span>
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Play className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Executing Query..." : "Execute Command"}
          </button>
        </div>

        {/* Output Section */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {output !== null && (
          <div className="flex-1 min-h-[200px] flex flex-col space-y-2 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Execution Result Output:</span>
              <button
                onClick={handleCopy}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Output"}
              </button>
            </div>
            <pre className="flex-1 overflow-auto bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-cyan-300 max-h-[300px]">
              {JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
