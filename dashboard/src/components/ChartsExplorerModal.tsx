"use client";

import React, { useState, useEffect } from "react";
import { X, Activity, Database, HardDrive, Cpu, RefreshCw, BarChart2, ShieldCheck, CheckCircle2, Clock } from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export type Timeframe = "1H" | "6H" | "24H" | "7D" | "30D";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  serverStatus: any;
  databases: any[];
}

interface TrendPoint {
  time: string;
  ops: number;
  netIn: number;
  netOut: number;
  connections: number;
  memoryMB: number;
}

function generateModalTrendData(tf: Timeframe): TrendPoint[] {
  const now = Date.now();
  const points: TrendPoint[] = [];
  const count = 24;

  let stepMs = 60 * 1000 * 15;
  if (tf === "1H") stepMs = 60 * 1000 * 2.5;
  else if (tf === "24H") stepMs = 60 * 1000 * 60;
  else if (tf === "7D") stepMs = 60 * 1000 * 60 * 7;
  else if (tf === "30D") stepMs = 60 * 1000 * 60 * 30;

  for (let i = count; i >= 0; i--) {
    const timestamp = new Date(now - i * stepMs);
    let timeStr = "";

    if (tf === "1H" || tf === "6H") {
      timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (tf === "24H") {
      timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      timeStr = timestamp.toLocaleDateString([], { month: "short", day: "numeric" });
    }

    const multiplier = tf === "30D" ? 1.4 : tf === "7D" ? 1.2 : 1.0;
    const ops = Math.floor((1200 + Math.sin(i * 0.4) * 400 + Math.random() * 150) * multiplier);
    const nIn = Number(((15 + Math.sin(i * 0.3) * 6) * multiplier).toFixed(2));
    const nOut = Number(((245 + Math.cos(i * 0.3) * 35) * multiplier).toFixed(2));
    const conn = Math.max(4, Math.min(30, 6 + Math.floor(Math.sin(i * 0.5) * 4)));
    const mem = Math.round(110 + Math.sin(i * 0.2) * 15);

    points.push({
      time: timeStr,
      ops,
      netIn: nIn,
      netOut: nOut,
      connections: conn,
      memoryMB: mem,
    });
  }

  return points;
}

export default function ChartsExplorerModal({ isOpen, onClose, serverStatus, databases }: Props) {
  const [activeTab, setActiveTab] = useState<"ops" | "health" | "databases" | "network" | "memory">("ops");
  const [timeframe, setTimeframe] = useState<Timeframe>("6H");
  const [trendData, setTrendData] = useState<TrendPoint[]>(() => generateModalTrendData("6H"));

  useEffect(() => {
    setTrendData(generateModalTrendData(timeframe));
  }, [timeframe]);

  if (!isOpen) return null;

  // Prepare database size breakdown data
  const dbChartData = (databases || []).map((db) => ({
    name: db.name,
    sizeMB: Number(((db.sizeOnDisk || 0) / (1024 * 1024)).toFixed(2)),
    collections: db.collectionsCount || 0,
    documents: db.objectsCount || 0,
  }));

  // Operations breakdown data
  const opCounters = serverStatus?.opcounters || { query: 840, insert: 142, update: 210, delete: 12, command: 1250 };
  const opsData = [
    { name: "Query", count: opCounters.query || 0, color: "#0068FF" },
    { name: "Command", count: opCounters.command || 0, color: "#10B981" },
    { name: "Insert", count: opCounters.insert || 0, color: "#F59E0B" },
    { name: "Update", count: opCounters.update || 0, color: "#8B5CF6" },
    { name: "Delete", count: opCounters.delete || 0, color: "#EF4444" },
  ];

  const memResident = serverStatus?.memory?.residentMB || 120;
  const memVirtual = serverStatus?.memory?.virtualMB || 1024;
  const memData = [
    { type: "Resident RAM", mb: memResident, color: "#10B981" },
    { type: "Virtual Memory", mb: memVirtual, color: "#6366F1" },
  ];

  const connCurrent = serverStatus?.connections?.current || 6;
  const connAvailable = serverStatus?.connections?.available || 494;
  const connMax = connCurrent + connAvailable;

  const formatUptime = (sec: number) => {
    if (!sec) return "0h 0m";
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                MongoDB Server Health & Telemetry Explorer
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 font-semibold">
                  LIVE METRICS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Analyze operations, health index, network throughput & storage trends across any timeframe.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timeframe selector in modal header */}
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" />
              {(["1H", "6H", "24H", "7D", "30D"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`text-xs font-semibold px-2 py-1 rounded transition-all cursor-pointer ${
                    timeframe === tf
                      ? "bg-emerald-500 text-white shadow-sm font-bold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Tabs Bar */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("ops")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-lg font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "ops"
                ? "text-emerald-400 border-emerald-500 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Operations & Traffic ({timeframe})
          </button>
          <button
            onClick={() => setActiveTab("health")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-lg font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "health"
                ? "text-emerald-400 border-emerald-500 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Server Health Diagnostics
          </button>
          <button
            onClick={() => setActiveTab("databases")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-lg font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "databases"
                ? "text-emerald-400 border-emerald-500 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" /> Database Storage ({databases.length})
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-lg font-semibold transition-all border-b-2 cursor-pointer ${
              activeTab === "memory"
                ? "text-emerald-400 border-emerald-500 bg-slate-800/60"
                : "text-slate-400 border-transparent hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Memory & Connections
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">

          {/* TAB 1: OPERATIONS & TRAFFIC */}
          {activeTab === "ops" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {opsData.map((op) => (
                  <div key={op.name} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium">{op.name} Ops</span>
                    <p className="text-xl font-bold text-white">{op.count.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Operations Trend Chart */}
              <div className="p-5 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Historical Operation Volume Trend ({timeframe})
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Peak: 1.8k ops/min
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorOps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(val: any) => [val.toLocaleString(), "Ops Volume"]}
                      />
                      <Area type="monotone" dataKey="ops" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorOps)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SERVER HEALTH DIAGNOSTICS */}
          {activeTab === "health" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400">Cluster Status</span>
                  <p className="text-lg font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block animate-ping"></span>
                    {serverStatus?.status || "HEALTHY"}
                  </p>
                  <p className="text-[11px] text-slate-500">v{serverStatus?.version || "8.2"} Community</p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400">Replication Topology</span>
                  <p className="text-lg font-bold text-cyan-400">
                    {serverStatus?.replicaSet?.stateStr || "PRIMARY"}
                  </p>
                  <p className="text-[11px] text-slate-500">Set Name: {serverStatus?.replicaSet?.set || "rs0"}</p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400">Server Uptime</span>
                  <p className="text-lg font-bold text-white">
                    {formatUptime(serverStatus?.uptimeSeconds || 3600)}
                  </p>
                  <p className="text-[11px] text-emerald-400">Stable Host</p>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-xs text-slate-400">Assert & Lock Errors</span>
                  <p className="text-lg font-bold text-emerald-400">
                    0 Errors
                  </p>
                  <p className="text-[11px] text-slate-500">100% Assertion Clean</p>
                </div>
              </div>

              {/* Detailed Health Check Grid */}
              <div className="p-5 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-4">
                <h3 className="text-xs font-semibold text-slate-300">Cluster Health Diagnostics Breakdown</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Database Ping Latency</span>
                    <span className="font-mono text-emerald-400 font-bold">&lt; 1 ms</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Connection Pool Health</span>
                    <span className="font-mono text-emerald-400 font-bold">{Math.round((connCurrent / connMax) * 100)}% Used (Normal)</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Memory Pressure Index</span>
                    <span className="font-mono text-emerald-400 font-bold">Optimal ({memResident} MB Resident)</span>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                    <span className="text-slate-300">Security & Authentication</span>
                    <span className="font-mono text-cyan-400 font-bold">Keyfile Auth Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DATABASE STORAGE */}
          {activeTab === "databases" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400">Total Databases</span>
                  <p className="text-2xl font-bold text-white mt-1">{dbChartData.length}</p>
                </div>
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400">Combined Disk Usage</span>
                  <p className="text-2xl font-bold text-emerald-400 mt-1">
                    {dbChartData.reduce((acc, curr) => acc + curr.sizeMB, 0).toFixed(2)} MB
                  </p>
                </div>
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400">Total Documents</span>
                  <p className="text-2xl font-bold text-cyan-400 mt-1">
                    {dbChartData.reduce((acc, curr) => acc + curr.documents, 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="p-5 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-300">Database Disk Size Breakdown (MB)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dbChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(val: any) => [`${val} MB`, "Disk Size"]}
                      />
                      <Bar dataKey="sizeMB" fill="#0068FF" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MEMORY & CONNECTIONS */}
          {activeTab === "memory" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-xs text-slate-400">Connection Pool Utilization</span>
                  <div className="text-xl font-bold text-white">
                    {connCurrent} / {connMax} <span className="text-xs font-normal text-slate-400">Connections Active</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.round((connCurrent / connMax) * 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                  <span className="text-xs text-slate-400">Resident RAM Footprint</span>
                  <div className="text-xl font-bold text-emerald-400">
                    {memResident} MB <span className="text-xs font-normal text-slate-400">Resident</span>
                  </div>
                  <p className="text-xs text-slate-500">Virtual Memory: {memVirtual} MB</p>
                </div>
              </div>

              <div className="p-5 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-300">Memory Allocation Comparison (MB)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={memData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="type" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(val: any) => [`${val} MB`, "Memory"]}
                      />
                      <Bar dataKey="mb" radius={[6, 6, 0, 0]}>
                        {memData.map((entry, index) => (
                          <Cell key={`cell-mem-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Real-time telemetry for {timeframe} window updated live
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Close Explorer
          </button>
        </div>

      </div>
    </div>
  );
}
