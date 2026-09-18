"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  ShieldCheck,
  HardDrive,
  Activity,
  RefreshCw,
  Plus,
  Play,
  CheckCircle2,
  Copy,
  Check,
  Lock,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Layers,
  Clock,
  Cpu,
  ChevronLeft,
  ChevronRight,
  FileArchive,
  KeyRound,
  Eye,
  EyeOff,
  User,
  LogOut,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ConfirmationModal from "@/components/ConfirmationModal";
import VisualizeYourData from "@/components/VisualizeYourData";
import ChartsExplorerModal from "@/components/ChartsExplorerModal";

interface ServerStatus {
  status: string;
  version: string;
  uptimeSeconds: number;
  connections: { current: number; available: number };
  replicaSet: { set: string; stateStr: string; membersCount: number };
  memory: { residentMB: number; virtualMB: number };
  opcounters: { insert?: number; query?: number; update?: number; delete?: number };
}

interface DBItem {
  name: string;
  sizeOnDisk: number;
  collectionsCount: number;
  objectsCount: number;
  dataSize: number;
  appUser: string | null;
  appPassword?: string | null;
  connectionString: string;
  unmaskedConnectionString?: string;
}

interface BackupItem {
  filename: string;
  sizeMB: string;
  createdAt: string;
  isEncrypted: boolean;
}

export default function MongoDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "databases" | "backups">("overview");
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [databases, setDatabases] = useState<DBItem[]>([]);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  // Application DBs Pagination State
  const [dbPage, setDbPage] = useState(1);
  const [dbPageSize, setDbPageSize] = useState(6);

  // Backups Pagination State
  const [backupPage, setBackupPage] = useState(1);
  const [backupPageSize, setBackupPageSize] = useState(10);

  // Modals & Action States
  const [showChartsModal, setShowChartsModal] = useState(false);
  const [showNewDbModal, setShowNewDbModal] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [newDbUser, setNewDbUser] = useState("");
  const [newDbPass, setNewDbPass] = useState("");

  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupLabel, setBackupLabel] = useState("");
  const [backupScope, setBackupScope] = useState<"full" | "db" | "collection">("full");
  const [backupDbName, setBackupDbName] = useState("opms");
  const [backupCollectionName, setBackupCollectionName] = useState("");

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Password Reset Modal State
  const [showResetPassModal, setShowResetPassModal] = useState(false);
  const [resetDbName, setResetDbName] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPass, setResetConfirmPass] = useState("");

  // Visible Passwords state per DB card (map of dbName -> boolean)
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [showModalPassText, setShowModalPassText] = useState(false);

  // Authenticated user session state
  const [currentUser, setCurrentUser] = useState<{
    username: string;
    role: string;
    db: string;
    allowedDbs: string[];
    isSuperAdmin: boolean;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionOutput, setActionOutput] = useState<string | null>(null);

  // Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDanger: boolean;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    isDanger: true,
    action: () => {},
  });

  // Time series chart data
  const [chartHistory, setChartHistory] = useState<any[]>([]);

  const fetchData = async () => {
    setRefreshing(true);
    try {
      const [statusRes, dbRes, backupRes] = await Promise.all([
        fetch("/api/server-status").then((r) => r.json()),
        fetch("/api/databases").then((r) => r.json()),
        fetch("/api/backups").then((r) => r.json()),
      ]);

      if (statusRes.success) setServerStatus(statusRes);
      if (dbRes.success) setDatabases(dbRes.databases || []);
      if (backupRes.success) setBackups(backupRes.backups || []);

      // Append point to chart history
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setChartHistory((prev) => {
        const next = [
          ...prev,
          {
            time: now,
            connections: statusRes.connections?.current || 0,
            residentMemory: statusRes.memory?.residentMB || 0,
          },
        ];
        return next.slice(-15);
      });
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: newDbName, username: newDbUser, password: newDbPass }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ SUCCESS: ${res.message}`);
        setNewDbName("");
        setNewDbUser("");
        setNewDbPass("");
        setShowNewDbModal(false);
        fetchData();
      } else {
        setActionOutput(`❌ ERROR: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerBackup = async () => {
    setActionLoading(true);
    setActionOutput(null);
    try {
      const payload: any = { action: "backup", label: backupLabel };
      if (backupScope === "db" || backupScope === "collection") {
        payload.db = backupDbName;
      }
      if (backupScope === "collection") {
        if (!backupCollectionName) {
          setActionOutput("❌ Collection name is required for collection-level backup.");
          setActionLoading(false);
          return;
        }
        payload.collection = backupCollectionName;
      }

      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ Backup Created Successfully!\nArchive: ${res.filename || ""}`);
        setShowBackupModal(false);
        setBackupLabel("");
        fetchData();
      } else {
        setActionOutput(`❌ ERROR: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setActionOutput(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const res = await fetch("/api/backups/upload", {
        method: "POST",
        body: formData,
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        setShowUploadModal(false);
        setUploadFile(null);
        fetchData();
      } else {
        setActionOutput(`❌ Upload Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassword) return;
    if (resetPassword !== resetConfirmPass) {
      setActionOutput("❌ Passwords do not match!");
      return;
    }
    setActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database: resetDbName, username: resetUsername, password: resetPassword }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ SUCCESS: ${res.message}\nConnection URI: ${res.connectionString}`);
        setShowResetPassModal(false);
        setResetPassword("");
        setResetConfirmPass("");
        fetchData();
      } else {
        setActionOutput(`❌ ERROR: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!-_";
    let pass = "";
    for (let i = 0; i < 20; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPassword(pass);
    setResetConfirmPass(pass);
  };

  const handleVerifyBackup = async (filename: string) => {
    setActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", filename }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ Verification Completed Cleanly!\n\n${res.output}`);
      } else {
        setActionOutput(`❌ Verification Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const requestRestoreBackup = (filename: string) => {
    setConfirmModalState({
      isOpen: true,
      title: `Restore Backup Snapshot?`,
      message: `WARNING: Restoring '${filename}' will run mongorestore --drop and overwrite existing database collections. Ensure you have a recent backup first!`,
      confirmText: "Restore Database",
      isDanger: true,
      action: () => executeRestoreBackup(filename),
    });
  };

  const executeRestoreBackup = async (filename: string) => {
    setActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", filename }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ Database Restored Cleanly from '${filename}'.`);
        fetchData();
      } else {
        setActionOutput(`❌ Restore Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const requestDeleteBackup = (filename: string) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Backup Archive?`,
      message: `Are you sure you want to permanently delete backup file '${filename}' from ./backups? This action cannot be undone.`,
      confirmText: "Delete Archive",
      isDanger: true,
      action: () => executeDeleteBackup(filename),
    });
  };

  const executeDeleteBackup = async (filename: string) => {
    setActionLoading(true);
    setActionOutput(null);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", filename }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        fetchData();
      } else {
        setActionOutput(`❌ Delete Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const requestDeleteDatabase = (dbName: string) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Database "${dbName}"?`,
      message: `CAUTION: Are you sure you want to permanently delete database "${dbName}"? All collections, indexes, and documents in this database will be destroyed. This action CANNOT be undone.`,
      confirmText: "Delete Database",
      isDanger: true,
      action: () => executeDeleteDatabase(dbName),
    });
  };

  const executeDeleteDatabase = async (dbName: string) => {
    setActionLoading(true);
    setActionOutput(`Deleting database '${dbName}'...`);
    try {
      const res = await fetch(`/api/databases/${encodeURIComponent(dbName)}`, {
        method: "DELETE",
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message || `Database '${dbName}' deleted successfully.`}`);
        fetchData();
      } else {
        setActionOutput(`❌ Delete Database Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ERROR: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const formatUptime = (secs: number) => {
    const days = Math.floor(secs / (3600 * 24));
    const hours = Math.floor((secs % (3600 * 24)) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  // Pagination Slice Calculations
  const paginatedDbs = databases.slice((dbPage - 1) * dbPageSize, dbPage * dbPageSize);
  const totalDbPages = Math.ceil(databases.length / dbPageSize) || 1;

  const paginatedBackups = backups.slice((backupPage - 1) * backupPageSize, backupPage * backupPageSize);
  const totalBackupPages = Math.ceil(backups.length / backupPageSize) || 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-inner">
            <Database className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">MongoDB Ops Console</h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                PROD HARDENED
              </span>
            </div>
            <p className="text-xs text-slate-400">Standalone Cluster • Replica Set rs0 • Docker Infrastructure</p>
          </div>
        </div>

        {/* Header Status Badges & User Profile */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-400">
              {serverStatus?.replicaSet?.stateStr || "PRIMARY"} ({serverStatus?.replicaSet?.set || "rs0"})
            </span>
          </div>

          {currentUser && (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-slate-200">{currentUser.username}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    currentUser.isSuperAdmin
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {currentUser.isSuperAdmin ? "SUPER ADMIN" : `SCOPED: ${currentUser.db}`}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 transition-all"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 transition-all"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Activity className="w-4 h-4" /> Overview & Performance
            </button>
            <button
              onClick={() => setActiveTab("databases")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "databases"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Database className="w-4 h-4" /> Application DBs ({databases.length})
            </button>
            {currentUser?.isSuperAdmin && (
              <button
                onClick={() => setActiveTab("backups")}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "backups"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                }`}
              >
                <HardDrive className="w-4 h-4" /> Backups & Restoration ({backups.length})
              </button>
            )}
            <a
              href="/explorer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-cyan-400 hover:bg-slate-900 border border-cyan-500/20 transition-all"
            >
              <Layers className="w-4 h-4" /> Data Explorer & Shell →
            </a>
          </div>

          <div className="flex items-center gap-3">
            {currentUser?.isSuperAdmin && (
              <>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold border border-slate-700 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload Backup
                </button>
                <button
                  onClick={() => setShowBackupModal(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/20 transition-all"
                >
                  <Play className="w-3.5 h-3.5" /> Trigger Backup
                </button>
                <button
                  onClick={() => setShowNewDbModal(true)}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /> New Database
                </button>
              </>
            )}
          </div>
        </div>

        {/* Global Action Log Notification */}
        {actionOutput && (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono whitespace-pre-wrap text-emerald-300 relative shadow-inner">
            <button
              onClick={() => setActionOutput(null)}
              className="absolute top-2 right-2 text-slate-500 hover:text-slate-300 text-sm font-bold"
            >
              ✕
            </button>
            {actionOutput}
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* MongoDB Atlas Sparkline Metrics Banner */}
            <VisualizeYourData onExplore={() => setShowChartsModal(true)} />

            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="glass-card p-5 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>RAM RESIDENT USAGE</span>
                  <Cpu className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {serverStatus?.memory?.residentMB || 0} <span className="text-xs font-normal text-slate-400">MB</span>
                </div>
                <div className="text-xs text-slate-500">Virtual: {serverStatus?.memory?.virtualMB || 0} MB</div>
              </div>

              <div className="glass-card p-5 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>ACTIVE CONNECTIONS</span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {serverStatus?.connections?.current || 0}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    / {(serverStatus?.connections?.current || 0) + (serverStatus?.connections?.available || 0)}
                  </span>
                </div>
                <div className="text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pool Healthy
                </div>
              </div>

              <div className="glass-card p-5 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>SERVER UPTIME</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {serverStatus ? formatUptime(serverStatus.uptimeSeconds) : "--"}
                </div>
                <div className="text-xs text-slate-500">v{serverStatus?.version || "8.2"} Community</div>
              </div>

              <div className="glass-card p-5 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                  <span>PROTECTION STATUS</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
                  <Lock className="w-5 h-5" /> Secured
                </div>
                <div className="text-xs text-slate-400">Keyfile Auth & Oplog Enabled</div>
              </div>
            </div>

            {/* Live Chart */}
            <div className="glass-panel p-6 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white">Real-Time Resource Metrics</h2>
                  <p className="text-xs text-slate-400">Active connection counts & memory resident trend</p>
                </div>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span> Live Scrape (8s)
                </span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartHistory}>
                    <defs>
                      <linearGradient id="colorConn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "0.5rem" }}
                    />
                    <Area type="monotone" dataKey="connections" stroke="#10b981" fillOpacity={1} fill="url(#colorConn)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: APPLICATION DATABASES (WITH PAGINATION) */}
        {activeTab === "databases" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedDbs.map((db, idx) => (
                <div key={db.name} className="glass-card p-5 rounded-xl space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-emerald-400" />
                        <h3 className="font-bold text-white text-base">{db.name}</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {db.collectionsCount} collections
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-800/80">
                      <div>
                        <span className="text-slate-400">Total Documents:</span>
                        <p className="text-white font-semibold text-sm">{db.objectsCount}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Disk Size:</span>
                        <p className="text-white font-semibold text-sm">{(db.sizeOnDisk / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-slate-400">App User:</span>
                          <button
                            onClick={() =>
                              setVisiblePasswords((prev) => ({
                                ...prev,
                                [db.name]: !prev[db.name],
                              }))
                            }
                            className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
                          >
                            {visiblePasswords[db.name] ? (
                              <>
                                <EyeOff className="w-3 h-3" /> Hide
                              </>
                            ) : (
                              <>
                                <Eye className="w-3 h-3" /> View
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-emerald-400 font-mono text-xs truncate">{db.appUser || "root / custom"}</p>
                        {visiblePasswords[db.name] && (
                          <div className="mt-1 p-1 rounded bg-amber-950/40 border border-amber-800/60 text-[11px] font-mono text-amber-300 select-all break-all">
                            {db.appPassword || "Password hidden / unconfigured"}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400">Privilege:</span>
                        <p className="text-slate-300 font-mono text-xs">readWrite</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/explorer?db=${db.name}`}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all truncate min-w-[110px]"
                      >
                        <Layers className="w-3.5 h-3.5" /> Explore DB
                      </a>
                      {currentUser?.isSuperAdmin && (
                        <button
                          onClick={() => {
                            setResetDbName(db.name);
                            setResetUsername(db.appUser || (db.name === "admin" ? "admin" : `${db.name}_user`));
                            setShowResetPassModal(true);
                          }}
                          className="py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all truncate"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" /> Reset Pass
                        </button>
                      )}
                      {currentUser?.isSuperAdmin && !["admin", "config", "local"].includes(db.name) && (
                        <button
                          onClick={() => requestDeleteDatabase(db.name)}
                          className="py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all truncate"
                          title="Delete Database"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete DB
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                      <span>Connection URI:</span>
                      <button
                        onClick={() =>
                          handleCopy(
                            visiblePasswords[db.name] && db.unmaskedConnectionString
                              ? db.unmaskedConnectionString
                              : db.connectionString,
                            `db-${idx}`
                          )
                        }
                        className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                      >
                        {copiedIndex === `db-${idx}` ? (
                          <>
                            <Check className="w-3.5 h-3.5" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy String
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type="text"
                      readOnly
                      value={
                        visiblePasswords[db.name] && db.unmaskedConnectionString
                          ? db.unmaskedConnectionString
                          : db.connectionString
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-400 truncate select-all"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* APPLICATION DBS PAGINATION BAR */}
            <div className="glass-panel p-3 rounded-xl flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={dbPageSize}
                  onChange={(e) => {
                    setDbPageSize(Number(e.target.value));
                    setDbPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white"
                >
                  <option value={6}>6 DBs</option>
                  <option value={9}>9 DBs</option>
                  <option value={12}>12 DBs</option>
                </select>
                <span>Displaying {Math.min((dbPage - 1) * dbPageSize + 1, databases.length)}–{Math.min(dbPage * dbPageSize, databases.length)} of {databases.length} databases</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={dbPage === 1}
                  onClick={() => setDbPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {dbPage} of {totalDbPages}</span>
                <button
                  disabled={dbPage >= totalDbPages}
                  onClick={() => setDbPage((p) => Math.min(totalDbPages, p + 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BACKUPS & RESTORATION (WITH FULL CONTROLS & PAGINATION) */}
        {activeTab === "backups" && (
          <div className="space-y-4">
            <div className="glass-panel rounded-xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Backups Archive Registry</h3>
                  <p className="text-xs text-slate-400">Daily dumps stored under ./backups with verification, download, upload, and restoration controls</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Backup
                  </button>
                  <button
                    onClick={() => setShowBackupModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/20 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" /> Create Backup Now
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Archive File</th>
                      <th className="px-5 py-3">Size</th>
                      <th className="px-5 py-3">Encryption</th>
                      <th className="px-5 py-3">Created At</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paginatedBackups.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                          No backup archives found in ./backups directory
                        </td>
                      </tr>
                    ) : (
                      paginatedBackups.map((b) => (
                        <tr key={b.filename} className="hover:bg-slate-900/50 transition-all">
                          <td className="px-5 py-3.5 font-mono text-slate-200">{b.filename}</td>
                          <td className="px-5 py-3.5 font-semibold text-white">{b.sizeMB} MB</td>
                          <td className="px-5 py-3.5">
                            {b.isEncrypted ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold text-xs">
                                AES-256 GPG
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-xs">Gzip Standard</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400">
                            {new Date(b.createdAt).toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right space-x-2">
                            <a
                              href={`/api/backups/download?filename=${encodeURIComponent(b.filename)}`}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 text-xs font-medium inline-flex items-center gap-1 transition-all"
                              title="Download to computer"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                            <button
                              onClick={() => handleVerifyBackup(b.filename)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-xs font-medium transition-all"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => requestRestoreBackup(b.filename)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-medium inline-flex items-center gap-1 transition-all"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Restore
                            </button>
                            <button
                              onClick={() => requestDeleteBackup(b.filename)}
                              disabled={actionLoading}
                              className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium transition-all"
                              title="Delete Archive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* BACKUPS REGISTRY PAGINATION BAR */}
            <div className="glass-panel p-3 rounded-xl flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>Show</span>
                <select
                  value={backupPageSize}
                  onChange={(e) => {
                    setBackupPageSize(Number(e.target.value));
                    setBackupPage(1);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white"
                >
                  <option value={5}>5 Backups</option>
                  <option value={10}>10 Backups</option>
                  <option value={25}>25 Backups</option>
                </select>
                <span>Displaying {Math.min((backupPage - 1) * backupPageSize + 1, backups.length)}–{Math.min(backupPage * backupPageSize, backups.length)} of {backups.length} archives</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={backupPage === 1}
                  onClick={() => setBackupPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span>Page {backupPage} of {totalBackupPages}</span>
                <button
                  disabled={backupPage >= totalBackupPages}
                  onClick={() => setBackupPage((p) => Math.min(totalBackupPages, p + 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* NEW DB MODAL */}
      {showNewDbModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" /> Provision New Database & User
            </h3>
            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Database Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. reporting"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. reporting_user"
                  value={newDbUser}
                  onChange={(e) => setNewDbUser(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Strong secret password"
                  value={newDbPass}
                  onChange={(e) => setNewDbPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewDbModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                >
                  {actionLoading ? "Provisioning..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRIGGER BACKUP MODAL */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Play className="w-5 h-5 text-emerald-400" /> Trigger Backup Archive
            </h3>
            <p className="text-xs text-slate-400">
              Creates a compressed dump of selected cluster scope to ./backups/
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Backup Granularity Scope</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setBackupScope("full")}
                    className={`py-1.5 text-[11px] font-semibold rounded transition-all ${
                      backupScope === "full" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Full Cluster
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupScope("db")}
                    className={`py-1.5 text-[11px] font-semibold rounded transition-all ${
                      backupScope === "db" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackupScope("collection")}
                    className={`py-1.5 text-[11px] font-semibold rounded transition-all ${
                      backupScope === "collection" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Collection
                  </button>
                </div>
              </div>

              {(backupScope === "db" || backupScope === "collection") && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Database</label>
                  <select
                    value={backupDbName}
                    onChange={(e) => setBackupDbName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  >
                    {databases.map((db) => (
                      <option key={db.name} value={db.name}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {backupScope === "collection" && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Collection Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. orders, users, products"
                    value={backupCollectionName}
                    onChange={(e) => setBackupCollectionName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-medium mb-1">Optional Backup Label</label>
                <input
                  type="text"
                  placeholder="e.g. pre-migration"
                  value={backupLabel}
                  onChange={(e) => setBackupLabel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 font-mono text-[11px] text-emerald-400 truncate">
                Filename: mongodb_
                {backupScope === "full"
                  ? "full"
                  : backupScope === "db"
                  ? backupDbName
                  : `${backupDbName}_${backupCollectionName || "<col>"}`}
                _&lt;timestamp&gt;.archive.gz
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTriggerBackup}
                  disabled={actionLoading || (backupScope === "collection" && !backupCollectionName)}
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {actionLoading ? "Executing Dump..." : "Start Backup"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD BACKUP MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-cyan-400" /> Upload External Backup Archive
            </h3>
            <p className="text-xs text-slate-400">
              Upload a `.archive.gz` or `.archive.gz.gpg` backup file to `./backups` server directory
            </p>

            <form onSubmit={handleUploadBackup} className="space-y-4 text-xs">
              <div className="border-2 border-dashed border-slate-800 hover:border-cyan-500 rounded-xl p-6 text-center space-y-2 bg-slate-950/50 transition-all">
                <FileArchive className="w-8 h-8 text-cyan-400 mx-auto" />
                <input
                  type="file"
                  accept=".archive.gz,.gpg"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="backup-file-input"
                />
                <label htmlFor="backup-file-input" className="cursor-pointer block text-slate-300 font-medium">
                  {uploadFile ? (
                    <span className="text-emerald-400 font-mono">{uploadFile.name} ({(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  ) : (
                    <span>Click to choose file or drag archive here</span>
                  )}
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5"
                >
                  {uploading ? "Uploading..." : "Upload File"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET USER PASSWORD MODAL */}
      {showResetPassModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" /> Reset Database User Password
              </h3>
              <button
                onClick={() => setShowResetPassModal(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Updates the user's password directly on the target database in MongoDB using administrative privileges.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Target Database</label>
                <input
                  type="text"
                  required
                  value={resetDbName}
                  onChange={(e) => setResetDbName(e.target.value)}
                  placeholder="e.g. opms, crm, admin"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value)}
                  placeholder="e.g. opms_user, admin"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium">New Password</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowModalPassText(!showModalPassText)}
                      className="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium flex items-center gap-1"
                    >
                      {showModalPassText ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showModalPassText ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-amber-400 hover:text-amber-300 text-[11px] underline font-medium"
                    >
                      Generate Strong Password
                    </button>
                  </div>
                </div>
                <input
                  type={showModalPassText ? "text" : "password"}
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Confirm New Password</label>
                <input
                  type={showModalPassText ? "text" : "password"}
                  required
                  value={resetConfirmPass}
                  onChange={(e) => setResetConfirmPass(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                {resetPassword && resetConfirmPass && resetPassword !== resetConfirmPass && (
                  <p className="text-red-400 text-[11px] mt-1">⚠️ Passwords do not match!</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResetPassModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !resetPassword || resetPassword !== resetConfirmPass}
                  className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-900/20"
                >
                  {actionLoading ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR RESTORE & DELETE */}
      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalState.action}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
        isDanger={confirmModalState.isDanger}
      />
      {/* CHARTS & TELEMETRY EXPLORER MODAL */}
      <ChartsExplorerModal
        isOpen={showChartsModal}
        onClose={() => setShowChartsModal(false)}
        serverStatus={serverStatus}
        databases={databases}
      />
    </div>
  );
}
