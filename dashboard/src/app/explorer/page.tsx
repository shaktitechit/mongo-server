"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Database,
  Layers,
  Search,
  Filter,
  ArrowUpDown,
  Plus,
  Trash2,
  Edit3,
  Terminal,
  RefreshCw,
  Copy,
  Check,
  Code,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  HardDrive,
} from "lucide-react";
import DocumentEditorModal from "@/components/DocumentEditorModal";
import MongoShellModal from "@/components/MongoShellModal";
import ConfirmationModal from "@/components/ConfirmationModal";

interface CollectionItem {
  name: string;
  count: number;
  sizeBytes: number;
  indexesCount: number;
}

function ExplorerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [currentDb, setCurrentDb] = useState(searchParams.get("db") || "opms");
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [selectedCol, setSelectedCol] = useState<string | null>(searchParams.get("col") || null);
  const [searchCol, setSearchCol] = useState("");

  // Query & Pagination states
  const [filterStr, setFilterStr] = useState("{}");
  const [sortStr, setSortStr] = useState("{}");
  const [limit, setLimit] = useState(25);
  const [skip, setSkip] = useState(0);

  // Documents & View mode
  const [documents, setDocuments] = useState<any[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [availableDbs, setAvailableDbs] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);
  const [loadingCols, setLoadingCols] = useState(false);

  // Modals & Action states
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any | null>(null);
  const [showShellModal, setShowShellModal] = useState(false);
  const [showCreateColModal, setShowCreateColModal] = useState(false);
  const [newColName, setNewColName] = useState("");

  // Inline editing state for document items
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineEditContent, setInlineEditContent] = useState("");
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);

  // Confirmation Modal states
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Delete",
    action: () => {},
  });

  const [actionOutput, setActionOutput] = useState<string | null>(null);

  const fetchAvailableDbs = async () => {
    try {
      const res = await fetch("/api/databases").then((r) => r.json());
      if (res.success && res.databases) {
        setAvailableDbs(res.databases.map((d: any) => d.name || d));
      } else {
        setAvailableDbs(["opms", "crm", "website", "inventory", "analytics", "powerapp", "admin", "reporting"]);
      }
    } catch {
      setAvailableDbs(["opms", "crm", "website", "inventory", "analytics", "powerapp", "admin", "reporting"]);
    }
  };

  // Fetch collections for database
  const fetchCollections = async (dbName: string) => {
    setLoadingCols(true);
    try {
      const res = await fetch(`/api/databases/${dbName}/collections`).then((r) => r.json());
      if (res.success) {
        setCollections(res.collections || []);
        if (res.collections.length > 0 && !selectedCol) {
          setSelectedCol(res.collections[0].name);
        }
      }
    } catch (err) {
      console.error("Failed to fetch collections", err);
    } finally {
      setLoadingCols(false);
    }
  };

  // Fetch documents for selected collection
  const fetchDocuments = async () => {
    if (!selectedCol) return;
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/databases/${currentDb}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "find",
          collection: selectedCol,
          filter: filterStr,
          sort: sortStr,
          limit,
          skip,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setDocuments(res.documents || []);
        setTotalDocs(res.totalCount || 0);
      } else {
        setActionOutput(`❌ Error fetching documents: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ Error: ${err.message}`);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchAvailableDbs();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setCurrentUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCollections(currentDb);
  }, [currentDb]);

  useEffect(() => {
    if (selectedCol) {
      fetchDocuments();
    }
  }, [selectedCol, limit, skip]);

  const handleDbChange = (newDb: string) => {
    setCurrentDb(newDb);
    setSelectedCol(null);
    setSkip(0);
    router.push(`/explorer?db=${newDb}`);
  };

  const handleSelectCollection = (colName: string) => {
    setSelectedCol(colName);
    setSkip(0);
    router.push(`/explorer?db=${currentDb}&col=${colName}`);
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName) return;
    try {
      const res = await fetch(`/api/databases/${currentDb}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newColName }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        setNewColName("");
        setShowCreateColModal(false);
        fetchCollections(currentDb);
        handleSelectCollection(newColName);
      } else {
        setActionOutput(`❌ ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ${err.message}`);
    }
  };

  const requestDropCollection = (colName: string) => {
    setConfirmModalState({
      isOpen: true,
      title: `Drop Collection '${colName}'?`,
      message: `Are you sure you want to permanently drop collection '${colName}' from database '${currentDb}'? All stored documents and indexes will be erased!`,
      confirmText: "Drop Collection",
      action: () => executeDropCollection(colName),
    });
  };

  const executeDropCollection = async (colName: string) => {
    try {
      const res = await fetch(`/api/databases/${currentDb}/collections`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: colName }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        if (selectedCol === colName) setSelectedCol(null);
        fetchCollections(currentDb);
      } else {
        setActionOutput(`❌ ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ${err.message}`);
    }
  };

  const handleSaveDocument = async (docJson: string, isEdit: boolean) => {
    if (!selectedCol) return;
    const parsedDoc = JSON.parse(docJson);

    const res = await fetch(`/api/databases/${currentDb}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "insert",
        collection: selectedCol,
        document: parsedDoc,
      }),
    }).then((r) => r.json());

    if (res.success) {
      setActionOutput(`✅ Document inserted cleanly.`);
      fetchDocuments();
    } else {
      throw new Error(res.error);
    }
  };

  const getDocIdString = (doc: any): string => {
    if (!doc || !doc._id) return "";
    if (typeof doc._id === "string") return doc._id;
    if (doc._id.$oid) return doc._id.$oid;
    return JSON.stringify(doc._id);
  };

  const startInlineEdit = (doc: any) => {
    const idStr = getDocIdString(doc);
    setInlineEditingId(idStr);
    setInlineEditContent(JSON.stringify(doc, null, 2));
    setInlineEditError(null);
  };

  const cancelInlineEdit = () => {
    setInlineEditingId(null);
    setInlineEditContent("");
    setInlineEditError(null);
  };

  const saveInlineEdit = async (doc: any) => {
    if (!selectedCol) return;
    setInlineSaving(true);
    setInlineEditError(null);

    try {
      let parsedDoc: any;
      try {
        parsedDoc = JSON.parse(inlineEditContent);
      } catch (err: any) {
        setInlineEditError(`Invalid JSON format: ${err.message}`);
        setInlineSaving(false);
        return;
      }

      const res = await fetch(`/api/databases/${currentDb}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          collection: selectedCol,
          filter: { _id: doc._id },
          update: parsedDoc,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        setInlineEditingId(null);
        setInlineEditContent("");
        fetchDocuments();
      } else {
        setInlineEditError(`❌ Update Failed: ${res.error}`);
      }
    } catch (err: any) {
      setInlineEditError(`❌ ERROR: ${err.message}`);
    } finally {
      setInlineSaving(false);
    }
  };

  const requestDeleteDocument = (doc: any) => {
    const docIdStr = getDocIdString(doc);
    setConfirmModalState({
      isOpen: true,
      title: "Delete Document?",
      message: `Are you sure you want to delete document with _id: ${docIdStr} from collection '${selectedCol}'?`,
      confirmText: "Delete Document",
      action: () => executeDeleteDocument(doc),
    });
  };

  const executeDeleteDocument = async (doc: any) => {
    if (!selectedCol) return;
    try {
      const res = await fetch(`/api/databases/${currentDb}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          collection: selectedCol,
          filter: { _id: doc._id },
        }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ ${res.message}`);
        fetchDocuments();
      } else {
        setActionOutput(`❌ ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ ${err.message}`);
    }
  };

  const handleBackupCollection = async () => {
    if (!selectedCol) return;
    setActionOutput(`⏳ Dumping collection '${currentDb}.${selectedCol}'...`);
    try {
      const res = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "backup",
          db: currentDb,
          collection: selectedCol,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setActionOutput(`✅ Collection backup created successfully!\nArchive: ${res.filename}`);
      } else {
        setActionOutput(`❌ Backup Failed: ${res.error}`);
      }
    } catch (err: any) {
      setActionOutput(`❌ Error: ${err.message}`);
    }
  };

  const filteredCollections = collections.filter((c) =>
    c.name.toLowerCase().includes(searchCol.toLowerCase())
  );

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
      {/* FIXED HEADER */}
      <header className="h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-all"
          >
            ← Back to Overview
          </button>
          <div className="h-4 w-px bg-slate-800"></div>

          {/* Database Selector Dropdown */}
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <select
              value={currentDb}
              onChange={(e) => handleDbChange(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-sm font-bold text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {availableDbs.map((d) => (
                <option key={d} value={d}>
                  db: {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentUser && (
            <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-slate-200">{currentUser.username}</span>
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                    currentUser.role === "SUPER_ADMIN"
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 transition-all"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => setShowShellModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Terminal className="w-4 h-4" /> Open Mongo Shell
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER WITH FIXED SIDEBAR AND SCROLLABLE CONTENT */}
      <div className="flex-1 flex overflow-hidden">
        {/* FIXED SIDEBAR: COLLECTIONS */}
        <aside className="w-72 border-r border-slate-800 bg-slate-950/70 p-4 flex flex-col space-y-3 shrink-0 h-[calc(100vh-3.5rem)]">
          <div className="flex items-center justify-between shrink-0">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" /> Collections ({collections.length})
            </h2>
            <button
              onClick={() => setShowCreateColModal(true)}
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 transition-all"
              title="Create Collection"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Collection Search */}
          <div className="relative shrink-0">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search collections..."
              value={searchCol}
              onChange={(e) => setSearchCol(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* SCROLLABLE Collections List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {loadingCols ? (
              <div className="text-xs text-slate-500 py-4 text-center flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Loading collections...
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="text-xs text-slate-500 py-6 text-center">No collections found</div>
            ) : (
              filteredCollections.map((col) => (
                <div
                  key={col.name}
                  onClick={() => handleSelectCollection(col.name)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                    selectedCol === col.name
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                      : "text-slate-300 hover:bg-slate-900"
                  }`}
                >
                  <span className="truncate">{col.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] text-slate-400 font-mono">
                      {col.count}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestDropCollection(col.name);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all"
                      title="Drop Collection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* RIGHT MAIN DATA VIEW AREA */}
        <main className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-5 space-y-4 h-[calc(100vh-3.5rem)]">
          {/* Action Log Notification */}
          {actionOutput && (
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400 relative shrink-0">
              <button
                onClick={() => setActionOutput(null)}
                className="absolute top-2 right-2 text-slate-500 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
              {actionOutput}
            </div>
          )}

          {selectedCol ? (
            <>
              {/* FIXED QUERY & FILTER TOOLBAR */}
              <div className="glass-panel p-4 rounded-xl space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-base font-bold text-white">{selectedCol}</h2>
                    <span className="text-xs text-slate-400 font-mono">({totalDocs} documents)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* View mode toggle */}
                    <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                      <button
                        onClick={() => setViewMode("tree")}
                        className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                          viewMode === "tree" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400"
                        }`}
                        title="Tree / JSON View"
                      >
                        <Code className="w-3.5 h-3.5" /> JSON
                      </button>
                      <button
                        onClick={() => setViewMode("table")}
                        className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                          viewMode === "table" ? "bg-slate-800 text-emerald-400 font-bold" : "text-slate-400"
                        }`}
                        title="Table View"
                      >
                        <TableIcon className="w-3.5 h-3.5" /> Table
                      </button>
                    </div>

                    <button
                      onClick={handleBackupCollection}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all"
                      title="Dump only this collection to ./backups/"
                    >
                      <HardDrive className="w-3.5 h-3.5" /> Backup Collection
                    </button>
                    <button
                      onClick={() => {
                        setEditingDoc(null);
                        setShowDocEditor(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/20 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Insert Document
                    </button>
                  </div>
                </div>

                {/* Filter Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                      <Filter className="w-3 h-3 text-cyan-400" /> Filter (JSON)
                    </label>
                    <input
                      type="text"
                      value={filterStr}
                      onChange={(e) => setFilterStr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-emerald-500"
                      placeholder='{ status: "active" }'
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                      <ArrowUpDown className="w-3 h-3 text-amber-400" /> Sort (JSON)
                    </label>
                    <input
                      type="text"
                      value={sortStr}
                      onChange={(e) => setSortStr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-emerald-500"
                      placeholder="{ createdAt: -1 }"
                    />
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Limit</label>
                        <select
                          value={limit}
                          onChange={(e) => setLimit(Number(e.target.value))}
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={fetchDocuments}
                      className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Search className="w-3.5 h-3.5" /> Find
                    </button>
                  </div>
                </div>
              </div>

              {/* SCROLLABLE DOCUMENT CONTENT CONTAINER */}
              <div className="flex-1 glass-panel rounded-xl overflow-y-auto p-4 space-y-3 min-h-0">
                {loadingDocs ? (
                  <div className="text-xs text-slate-500 py-12 text-center flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" /> Fetching documents...
                  </div>
                ) : documents.length === 0 ? (
                  <div className="text-xs text-slate-500 py-12 text-center">
                    No documents found matching filter parameters
                  </div>
                ) : viewMode === "tree" ? (
                  /* TREE / JSON VIEW WITH INLINE ON-PAGE EDITING */
                  documents.map((doc, idx) => {
                    const docIdStr = getDocIdString(doc);
                    const isEditing = inlineEditingId === docIdStr;

                    if (isEditing) {
                      return (
                        <div
                          key={docIdStr || idx}
                          className="glass-card p-4 rounded-xl border border-amber-500/50 space-y-3 bg-slate-900/90 shadow-xl"
                        >
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1.5">
                              ✏️ Editing Document (_id: {docIdStr})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  const p = JSON.parse(inlineEditContent);
                                  setInlineEditContent(JSON.stringify(p, null, 2));
                                  setInlineEditError(null);
                                } catch (e: any) {
                                  setInlineEditError(`Prettify error: ${e.message}`);
                                }
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono border border-slate-700 transition-all"
                            >
                              Prettify JSON
                            </button>
                          </div>

                          <textarea
                            value={inlineEditContent}
                            onChange={(e) => {
                              setInlineEditContent(e.target.value);
                              setInlineEditError(null);
                            }}
                            rows={Math.max(6, inlineEditContent.split("\n").length + 1)}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg p-3 font-mono text-xs text-slate-100 focus:outline-none resize-y leading-relaxed"
                            spellCheck={false}
                          />

                          {inlineEditError && (
                            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
                              {inlineEditError}
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={cancelInlineEdit}
                              className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveInlineEdit(doc)}
                              disabled={inlineSaving}
                              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
                            >
                              {inlineSaving ? "Saving..." : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={docIdStr || idx}
                        className="glass-card p-4 rounded-xl border border-slate-800/80 space-y-2 hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                          <span className="text-xs font-mono text-slate-400">
                            _id: <span className="text-emerald-400 font-semibold">{docIdStr}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startInlineEdit(doc)}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-800 text-xs font-medium flex items-center gap-1 transition-all"
                            >
                              <Edit3 className="w-3 h-3" /> Edit Inline
                            </button>
                            <button
                              onClick={() => requestDeleteDocument(doc)}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-rose-400 border border-slate-800 text-xs font-medium flex items-center gap-1 transition-all"
                            >
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>
                        <pre className="text-xs font-mono text-cyan-300 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(doc, null, 2)}
                        </pre>
                      </div>
                    );
                  })
                ) : (
                  /* TABLE VIEW WITH INLINE EDITING */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5">_id</th>
                          <th className="px-4 py-2.5">Document Details</th>
                          <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {documents.map((doc, idx) => {
                          const docIdStr = getDocIdString(doc);
                          const isEditing = inlineEditingId === docIdStr;

                          if (isEditing) {
                            return (
                              <tr key={docIdStr || idx} className="bg-slate-900/90 border-amber-500/40">
                                <td colSpan={3} className="p-4 space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                    <span className="text-xs font-mono text-amber-400 font-bold">
                                      ✏️ Editing Document (_id: {docIdStr})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        try {
                                          const p = JSON.parse(inlineEditContent);
                                          setInlineEditContent(JSON.stringify(p, null, 2));
                                          setInlineEditError(null);
                                        } catch (e: any) {
                                          setInlineEditError(`Prettify error: ${e.message}`);
                                        }
                                      }}
                                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono border border-slate-700"
                                    >
                                      Prettify JSON
                                    </button>
                                  </div>

                                  <textarea
                                    value={inlineEditContent}
                                    onChange={(e) => {
                                      setInlineEditContent(e.target.value);
                                      setInlineEditError(null);
                                    }}
                                    rows={Math.max(5, inlineEditContent.split("\n").length + 1)}
                                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-lg p-3 font-mono text-xs text-slate-100 focus:outline-none resize-y leading-relaxed"
                                    spellCheck={false}
                                  />

                                  {inlineEditError && (
                                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono">
                                      {inlineEditError}
                                    </div>
                                  )}

                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={cancelInlineEdit}
                                      className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => saveInlineEdit(doc)}
                                      disabled={inlineSaving}
                                      className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-900/20"
                                    >
                                      {inlineSaving ? "Saving..." : "Save Changes"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr key={docIdStr || idx} className="hover:bg-slate-900/50">
                              <td className="px-4 py-3 font-mono text-emerald-400 text-xs">
                                {docIdStr}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-300 text-xs max-w-xl truncate">
                                {JSON.stringify(doc)}
                              </td>
                              <td className="px-4 py-3 text-right space-x-2">
                                <button
                                  onClick={() => startInlineEdit(doc)}
                                  className="text-amber-400 hover:underline text-xs"
                                >
                                  Edit Inline
                                </button>
                                <button
                                  onClick={() => requestDeleteDocument(doc)}
                                  className="text-rose-400 hover:underline text-xs"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* FIXED BOTTOM PAGINATION BAR */}
              <div className="flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400 shrink-0">
                <span>
                  Showing {skip + 1} – {Math.min(skip + limit, totalDocs)} of {totalDocs} documents
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={skip === 0}
                    onClick={() => setSkip(Math.max(0, skip - limit))}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>Page {Math.floor(skip / limit) + 1}</span>
                  <button
                    disabled={skip + limit >= totalDocs}
                    onClick={() => setSkip(skip + limit)}
                    className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select a collection from the sidebar to explore documents
            </div>
          )}
        </main>
      </div>

      {/* CREATE COLLECTION MODAL */}
      {showCreateColModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-6 rounded-xl space-y-4 border border-slate-800 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" /> Create Collection in '{currentDb}'
            </h3>
            <form onSubmit={handleCreateCollection} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Collection Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. orders"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateColModal(false)}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  Create Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT EDITOR MODAL (For inserting new documents) */}
      {selectedCol && (
        <DocumentEditorModal
          isOpen={showDocEditor}
          onClose={() => setShowDocEditor(false)}
          onSave={handleSaveDocument}
          initialDoc={null}
          collectionName={selectedCol}
        />
      )}

      {/* MONGO SHELL MODAL */}
      <MongoShellModal
        isOpen={showShellModal}
        onClose={() => setShowShellModal(false)}
        database={currentDb}
      />

      {/* CUSTOM CONFIRMATION MODAL */}
      <ConfirmationModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalState.action}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
      />
    </div>
  );
}

export default function DataExplorerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-xs">Loading Data Explorer...</div>}>
      <ExplorerContent />
    </Suspense>
  );
}
