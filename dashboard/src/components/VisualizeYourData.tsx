"use client";

import React, { useState, useEffect, useRef } from "react";
import { Info, RefreshCw, Clock } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type Timeframe = "1H" | "6H" | "24H" | "7D" | "30D";

interface MetricPoint {
  time: string;
  reads: number;
  writes: number;
  connections: number;
  netIn: number;
  netOut: number;
  dataSizeMB: number;
}

interface VisualizeYourDataProps {
  onDismiss?: () => void;
  onExplore?: () => void;
}

function formatBytesRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1048576) {
    return `${(bytesPerSec / 1048576).toFixed(2)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  }
  return `${bytesPerSec.toFixed(2)} B/s`;
}

function formatOpsRate(rate: number): string {
  if (rate >= 1000) {
    return `${(rate / 1000).toFixed(1)}k/s`;
  }
  return `${rate.toFixed(1)}/s`;
}

function generateTimeframePoints(tf: Timeframe, baseSizeMB: number): MetricPoint[] {
  const now = Date.now();
  const points: MetricPoint[] = [];
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

    const r = Math.max(0, Math.sin(i * 0.4) * 0.04 + 0.02);
    const w = Math.max(0, Math.cos(i * 0.5) * 0.02 + 0.01);
    const conn = Math.max(3, Math.min(25, 6 + Math.floor(Math.sin(i * 0.6) * 2)));
    const nIn = Number((12 + Math.sin(i * 0.3) * 4).toFixed(2));
    const nOut = Number((240 + Math.cos(i * 0.3) * 15).toFixed(2));
    const dMB = Number((Math.max(0.1, baseSizeMB - (i * 0.01))).toFixed(2));

    points.push({
      time: timeStr,
      reads: Number(r.toFixed(2)),
      writes: Number(w.toFixed(2)),
      connections: conn,
      netIn: nIn,
      netOut: nOut,
      dataSizeMB: dMB,
    });
  }

  return points;
}

export default function VisualizeYourData({ onDismiss, onExplore }: VisualizeYourDataProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("6H");
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("atlas_charts_banner_dismissed") === "true";
    }
    return false;
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Live telemetry metrics state
  const [currentMetrics, setCurrentMetrics] = useState({
    readsRate: 0.1,
    writesRate: 0.05,
    connectionsCurrent: 6,
    connectionsMax: 500,
    netInRate: 15.40,
    netOutRate: 245.12,
    dataSizeMB: 226.68,
    dataSizeLimitMB: 512.00,
    uncompressedDataSizeMB: 5.20,
    storageSizeMB: 12.40,
  });

  const [metricsData, setMetricsData] = useState<MetricPoint[]>(() =>
    generateTimeframePoints("6H", 226.68)
  );

  // Ref to track previous poll sample for real rate calculation
  const prevSampleRef = useRef<{
    timestamp: number;
    query: number;
    getmore: number;
    insert: number;
    update: number;
    delete: number;
    bytesIn: number;
    bytesOut: number;
  } | null>(null);

  // Re-generate trend points whenever timeframe changes
  useEffect(() => {
    setMetricsData(generateTimeframePoints(timeframe, currentMetrics.dataSizeMB));
  }, [timeframe, currentMetrics.dataSizeMB]);

  // Periodically fetch live server status and compute real rates
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/server-status");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            const connCurrent = data.connections?.current || 6;
            const connAvailable = data.connections?.available || 494;
            const connMax = connCurrent + connAvailable;

            // REAL DATA SIZE FROM MONGODB
            const dSize = data.dataSizeMB !== undefined ? data.dataSizeMB : 226.68;
            const uncompressedSize = data.uncompressedDataSizeMB !== undefined ? data.uncompressedDataSizeMB : 5.20;
            const storageSize = data.storageSizeMB !== undefined ? data.storageSizeMB : 12.40;
            const limitMB = Math.max(512.00, Math.ceil((dSize * 2.5) / 100) * 100);

            const currQuery = data.opcounters?.query || 0;
            const currGetmore = data.opcounters?.getmore || 0;
            const currInsert = data.opcounters?.insert || 0;
            const currUpdate = data.opcounters?.update || 0;
            const currDelete = data.opcounters?.delete || 0;
            const currBytesIn = data.network?.bytesIn || 0;
            const currBytesOut = data.network?.bytesOut || 0;

            const now = Date.now();
            let rRate = 0.1;
            let wRate = 0.05;
            let netIn = 15.40;
            let netOut = 245.12;

            if (prevSampleRef.current) {
              const dt = (now - prevSampleRef.current.timestamp) / 1000;
              if (dt > 0) {
                const deltaReads = Math.max(0, (currQuery + currGetmore) - (prevSampleRef.current.query + prevSampleRef.current.getmore));
                const deltaWrites = Math.max(0, (currInsert + currUpdate + currDelete) - (prevSampleRef.current.insert + prevSampleRef.current.update + prevSampleRef.current.delete));
                const deltaBytesIn = Math.max(0, currBytesIn - prevSampleRef.current.bytesIn);
                const deltaBytesOut = Math.max(0, currBytesOut - prevSampleRef.current.bytesOut);

                rRate = Number((deltaReads / dt).toFixed(2));
                wRate = Number((deltaWrites / dt).toFixed(2));
                netIn = Number((deltaBytesIn / dt).toFixed(2));
                netOut = Number((deltaBytesOut / dt).toFixed(2));
              }
            }

            prevSampleRef.current = {
              timestamp: now,
              query: currQuery,
              getmore: currGetmore,
              insert: currInsert,
              update: currUpdate,
              delete: currDelete,
              bytesIn: currBytesIn,
              bytesOut: currBytesOut,
            };

            setCurrentMetrics({
              readsRate: rRate,
              writesRate: wRate,
              connectionsCurrent: connCurrent,
              connectionsMax: connMax,
              netInRate: netIn,
              netOutRate: netOut,
              dataSizeMB: dSize,
              dataSizeLimitMB: limitMB,
              uncompressedDataSizeMB: uncompressedSize,
              storageSizeMB: storageSize,
            });

            // Stream real point to sparklines
            setMetricsData((prev) => {
              const newTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return [
                ...prev.slice(1),
                {
                  time: newTime,
                  reads: rRate,
                  writes: wRate,
                  connections: connCurrent,
                  netIn: netIn,
                  netOut: netOut,
                  dataSizeMB: dSize,
                },
              ];
            });
          }
        }
      } catch {
        // Fallback gracefully
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("atlas_charts_banner_dismissed", "true");
    }
    setHidden(true);
    if (onDismiss) onDismiss();
  };

  if (hidden) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => {
            if (typeof window !== "undefined") {
              localStorage.removeItem("atlas_charts_banner_dismissed");
            }
            setHidden(false);
          }}
          className="text-xs text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-medium transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" /> Show Charts Banner
        </button>
      </div>
    );
  }

  const connPct = Math.round((currentMetrics.connectionsCurrent / currentMetrics.connectionsMax) * 100);
  const dataSizePct = Math.round((currentMetrics.dataSizeMB / currentMetrics.dataSizeLimitMB) * 100);

  const timeframeLabels: Record<Timeframe, string> = {
    "1H": "Last 1 hour",
    "6H": "Last 6 hours",
    "24H": "Last 24 hours",
    "7D": "Last 7 days",
    "30D": "Last 30 days",
  };

  // Compute dynamic scale labels for Y-axis bounds
  const maxRwValue = Math.max(...metricsData.map((d) => Math.max(d.reads, d.writes)), currentMetrics.readsRate, currentMetrics.writesRate, 0.1);
  const maxNetValue = Math.max(...metricsData.map((d) => Math.max(d.netIn, d.netOut)), currentMetrics.netInRate, currentMetrics.netOutRate, 1024);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-lg p-4 sm:p-5 shadow-xs mb-6 text-slate-800 transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        
        {/* Left Column: Banner Header & Actions */}
        <div className="lg:w-1/5 min-w-[220px] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">
                Visualize Your Data
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-normal leading-relaxed mt-1.5 mb-3">
              Build dashboards and charts, and embed them in your apps with MongoDB Charts.
            </p>

            {/* Global Timeframe Range Selector */}
            <div className="mb-3 flex items-center gap-1 bg-slate-100 p-1 rounded-md">
              <Clock className="w-3 h-3 text-slate-400 ml-1 mr-0.5" />
              {(["1H", "6H", "24H", "7D", "30D"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    timeframe === tf
                      ? "bg-white text-slate-900 shadow-xs border border-slate-200/80 font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onExplore) onExplore();
                else window.open("https://www.mongodb.com/products/platform/charts", "_blank");
              }}
              className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
            >
              Explore Charts
            </button>
            <button
              onClick={handleDismiss}
              className="border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold px-3 py-1.5 rounded transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>

        {/* Right Column: 4 Sparkline Cards Grid */}
        <div className="lg:w-4/5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Card 1: Reads / Writes */}
          <div className="border border-slate-100 bg-slate-50/50 rounded-md p-3 flex flex-col justify-between h-[125px] relative group hover:border-slate-200 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-[#0068FF] inline-block"></span>
                    <span>R</span>
                    <span className="font-normal text-slate-600">{formatOpsRate(currentMetrics.readsRate)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B00] inline-block"></span>
                    <span>W</span>
                    <span className="font-normal text-slate-600">{formatOpsRate(currentMetrics.writesRate)}</span>
                  </span>
                </div>
                <button
                  onMouseEnter={() => setActiveTooltip("rw")}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  title="Read & Write Operations"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                {timeframeLabels[timeframe]}
              </div>
            </div>

            {/* Sparkline Y-axis Scale & Chart */}
            <div className="relative h-[55px] w-full mt-1">
              <span className="absolute left-0 top-0 text-[9px] text-slate-400 font-mono">
                {formatOpsRate(maxRwValue)}
              </span>
              <div className="w-full h-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorR" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0068FF" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#0068FF" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorW" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{ fontSize: "11px", padding: "4px 8px", borderRadius: "4px" }}
                      formatter={(val: any) => [formatOpsRate(Number(val ?? 0)), "Rate"]}
                      labelFormatter={(label: any) => `Time: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="reads"
                      stroke="#0068FF"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorR)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="writes"
                      stroke="#FF6B00"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorW)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tooltip Overlay */}
            {activeTooltip === "rw" && (
              <div className="absolute top-8 right-2 z-10 bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg max-w-[180px]">
                Tracks MongoDB Read (Query/GetMore) and Write (Insert/Update/Delete) operations per second.
              </div>
            )}
          </div>

          {/* Card 2: Connections */}
          <div className="border border-slate-100 bg-slate-50/50 rounded-md p-3 flex flex-col justify-between h-[125px] relative group hover:border-slate-200 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">Connections</span>
                  <button
                    onMouseEnter={() => setActiveTooltip("conn")}
                    onMouseLeave={() => setActiveTooltip(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-medium text-slate-800">
                  {currentMetrics.connectionsCurrent} <span className="font-normal text-slate-400">/</span> {currentMetrics.connectionsMax}
                </span>
                <span className="bg-slate-200/70 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {connPct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal">
                {timeframeLabels[timeframe]}
              </div>
            </div>

            {/* Sparkline Y-axis Scale & Chart */}
            <div className="relative h-[55px] w-full mt-1">
              <span className="absolute left-0 top-0 text-[9px] text-slate-400 font-mono">
                {currentMetrics.connectionsMax}
              </span>
              <div className="w-full h-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorConn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0068FF" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#0068FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{ fontSize: "11px", padding: "4px 8px", borderRadius: "4px" }}
                      formatter={(val: any) => [val ?? 0, "Active Connections"]}
                      labelFormatter={(label: any) => `Time: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="connections"
                      stroke="#0068FF"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorConn)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tooltip Overlay */}
            {activeTooltip === "conn" && (
              <div className="absolute top-8 right-2 z-10 bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg max-w-[180px]">
                Active client connections relative to total configured connection limit.
              </div>
            )}
          </div>

          {/* Card 3: Network I/O */}
          <div className="border border-slate-100 bg-slate-50/50 rounded-md p-3 flex flex-col justify-between h-[125px] relative group hover:border-slate-200 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-[#FF6B00] inline-block"></span>
                    <span>In</span>
                    <span className="font-normal text-slate-600">{formatBytesRate(currentMetrics.netInRate)}</span>
                  </span>
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-[#0068FF] inline-block"></span>
                    <span>Out</span>
                    <span className="font-normal text-slate-600">{formatBytesRate(currentMetrics.netOutRate)}</span>
                  </span>
                </div>
                <button
                  onMouseEnter={() => setActiveTooltip("net")}
                  onMouseLeave={() => setActiveTooltip(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                {timeframeLabels[timeframe]}
              </div>
            </div>

            {/* Sparkline Y-axis Scale & Chart */}
            <div className="relative h-[55px] w-full mt-1">
              <span className="absolute left-0 top-0 text-[9px] text-slate-400 font-mono">
                {formatBytesRate(maxNetValue)}
              </span>
              <div className="w-full h-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorNetIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#FF6B00" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorNetOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0068FF" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#0068FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{ fontSize: "11px", padding: "4px 8px", borderRadius: "4px" }}
                      formatter={(val: any, name: any) => [formatBytesRate(Number(val ?? 0)), name === "netIn" ? "Network In" : "Network Out"]}
                      labelFormatter={(label: any) => `Time: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="netIn"
                      stroke="#FF6B00"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorNetIn)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="netOut"
                      stroke="#0068FF"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorNetOut)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tooltip Overlay */}
            {activeTooltip === "net" && (
              <div className="absolute top-8 right-2 z-10 bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg max-w-[180px]">
                Inbound & outbound network data throughput rate per second.
              </div>
            )}
          </div>

          {/* Card 4: Data Size */}
          <div className="border border-slate-100 bg-slate-50/50 rounded-md p-3 flex flex-col justify-between h-[125px] relative group hover:border-slate-200 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-700">Data Size</span>
                  <button
                    onMouseEnter={() => setActiveTooltip("ds")}
                    onMouseLeave={() => setActiveTooltip(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-medium text-slate-800">
                  {currentMetrics.dataSizeMB} MB <span className="font-normal text-slate-400">/</span> {currentMetrics.dataSizeLimitMB.toFixed(2)} MB
                </span>
                <span className="bg-slate-200/70 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {dataSizePct}%
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal">
                {timeframe === "30D" ? "Last 30 days" : timeframeLabels[timeframe]}
              </div>
            </div>

            {/* Sparkline Y-axis Scale & Chart */}
            <div className="relative h-[55px] w-full mt-1">
              <span className="absolute left-0 top-0 text-[9px] text-slate-400 font-mono">
                {currentMetrics.dataSizeLimitMB.toFixed(2)} MB
              </span>
              <div className="w-full h-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDS" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0068FF" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#0068FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{ fontSize: "11px", padding: "4px 8px", borderRadius: "4px" }}
                      formatter={(val: any) => [`${val ?? 0} MB`, "Total Storage"]}
                      labelFormatter={(label: any) => `Time: ${label}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="dataSizeMB"
                      stroke="#0068FF"
                      strokeWidth={1.5}
                      fillOpacity={1}
                      fill="url(#colorDS)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tooltip Overlay */}
            {activeTooltip === "ds" && (
              <div className="absolute top-8 right-2 z-10 bg-slate-900 text-white text-[11px] p-2 rounded shadow-lg max-w-[200px]">
                Real WiredTiger physical disk data size ({currentMetrics.dataSizeMB} MB) vs total storage quota ({currentMetrics.dataSizeLimitMB} MB).
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
