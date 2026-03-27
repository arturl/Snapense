import { useState, useEffect, useCallback } from "react";
import type { DriveItem, ProcessedFile } from "@snapense/shared";
import { api, downloadBlob } from "../api/client";

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export function FileBrowser() {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: "Home" },
  ]);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [results, setResults] = useState<ProcessedFile[] | null>(null);
  const [downloadKey, setDownloadKey] = useState<string | null>(null);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFolder = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError("");
    setSelected(new Set());
    try {
      const path = folderId ? `/api/drive/folder/${folderId}` : "/api/drive/root";
      const data = await api.get<{ value: DriveItem[] }>(path);
      setItems(data.value || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  function navigateToFolder(item: DriveItem) {
    setBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  }

  function navigateToBreadcrumb(index: number) {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(items.filter((i) => i.file).map((i) => i.id)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function processSelected() {
    const fileIds = Array.from(selected);
    const total = fileIds.length;
    setProcessing(true);
    setResults(null);
    setDownloadKey(null);
    setError("");
    setProgressPct(0);
    setProgressText(`Starting... 0 of ${total}`);

    // Fake incremental progress while waiting for the server
    // (server processes all at once, so we simulate per-file ticks)
    let tick = 0;
    const interval = setInterval(() => {
      tick = Math.min(tick + 1, total - 1);
      setProgressPct(Math.round((tick / total) * 90));
      setProgressText(`Processing file ${tick + 1} of ${total}...`);
    }, 2500);

    try {
      const data = await api.post<{
        files: ProcessedFile[];
        downloadKey: string;
      }>("/api/process", { fileIds });
      clearInterval(interval);
      setProgressPct(100);
      setProgressText(`Done! ${data.files.filter((f) => f.status === "success").length} of ${total} files processed.`);
      setResults(data.files);
      setDownloadKey(data.downloadKey);
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message);
      setProgressText("Failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function downloadZip() {
    if (!downloadKey) return;
    try {
      const blob = await downloadBlob(`/api/download/${downloadKey}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const folderItems = items.filter((i) => i.folder);
  const fileItems = items.filter((i) => i.file);

  return (
    <div style={{ display: "flex", gap: 16, minHeight: "calc(100vh - 100px)" }}>
      {/* LEFT PANE — File browser */}
      <div style={{ flex: "1 1 55%", minWidth: 0 }}>
        <div style={card}>
          {/* Breadcrumbs */}
          <nav style={{ marginBottom: 12, fontSize: 13 }}>
            {breadcrumbs.map((bc, i) => (
              <span key={i}>
                {i > 0 && <span style={{ margin: "0 5px", color: "#aaa" }}>/</span>}
                {i < breadcrumbs.length - 1 ? (
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); navigateToBreadcrumb(i); }}
                    style={{ color: "#0078d4", textDecoration: "none" }}
                  >
                    {bc.name}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600 }}>{bc.name}</span>
                )}
              </span>
            ))}
          </nav>

          {error && (
            <div style={errorBox}>{error}</div>
          )}

          {/* Actions bar */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <button onClick={selectAll} style={smallBtn}>Select all</button>
            <button onClick={selectNone} style={smallBtn}>Clear</button>
            <span style={{ color: "#888", fontSize: 12, marginLeft: 4 }}>
              {selected.size} selected
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={processSelected}
              disabled={selected.size === 0 || processing}
              style={{
                ...smallBtn,
                background: selected.size > 0 && !processing ? "#0078d4" : "#c0c0c0",
                color: "#fff", border: "none", padding: "7px 18px", fontWeight: 600,
              }}
            >
              {processing ? "Processing..." : "Process Receipts"}
            </button>
          </div>

          {/* File list */}
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>Loading files...</div>
          ) : (
            <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #eee", textAlign: "left", color: "#777", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <th style={{ width: 28, padding: "6px 8px" }}></th>
                    <th style={{ padding: "6px 8px" }}>Name</th>
                    <th style={{ padding: "6px 8px", width: 80 }}>Size</th>
                    <th style={{ padding: "6px 8px", width: 90 }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {folderItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                      onClick={() => navigateToFolder(item)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={{ padding: "6px 8px" }}></td>
                      <td style={{ padding: "6px 8px", color: "#0078d4", fontWeight: 500 }}>
                        <span style={{ marginRight: 6 }}>&#128193;</span>{item.name}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#aaa", fontSize: 12 }}>
                        {item.folder?.childCount} items
                      </td>
                      <td style={{ padding: "6px 8px", color: "#aaa", fontSize: 12 }}>
                        {new Date(item.createdDateTime).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {fileItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid #f0f0f0",
                        background: selected.has(item.id) ? "#e8f2fc" : undefined,
                      }}
                      onMouseEnter={(e) => { if (!selected.has(item.id)) e.currentTarget.style.background = "#f8f9fb"; }}
                      onMouseLeave={(e) => { if (!selected.has(item.id)) e.currentTarget.style.background = ""; }}
                    >
                      <td style={{ padding: "6px 8px" }}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          style={{ accentColor: "#0078d4" }}
                        />
                      </td>
                      <td style={{ padding: "6px 8px" }}>{item.name}</td>
                      <td style={{ padding: "6px 8px", color: "#aaa", fontSize: 12 }}>
                        {item.size ? formatSize(item.size) : "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#aaa", fontSize: 12 }}>
                        {new Date(item.createdDateTime).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 20, textAlign: "center", color: "#aaa" }}>
                        This folder is empty
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE — Progress + Results */}
      <div style={{ flex: "1 1 45%", minWidth: 0 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#333" }}>
            Processed Receipts
          </h3>

          {!results && !processing && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
              Select files on the left and click "Process Receipts" to get started.
            </div>
          )}

          {/* Progress bar */}
          {(processing || progressPct > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>{progressText}</div>
              <div style={{ height: 6, background: "#e8e8e8", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: progressPct === 100
                      ? "linear-gradient(90deg, #107c10, #1a9e1a)"
                      : "linear-gradient(90deg, #0078d4, #3aa0f0)",
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Results list */}
          {results && (
            <>
              <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 6,
                      marginBottom: 6,
                      background: r.status === "success" ? "#f0f9f0" : "#fef0f0",
                      border: `1px solid ${r.status === "success" ? "#c8e6c8" : "#f5c6c6"}`,
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                      {r.originalName}
                    </div>
                    <div style={{
                      fontSize: 13,
                      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                      fontWeight: 500,
                      color: r.status === "success" ? "#1a6e1a" : "#c00",
                      wordBreak: "break-all",
                    }}>
                      {r.status === "success" ? r.newName : r.error}
                    </div>
                    {r.status === "success" && (
                      <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
                        {r.ocr.merchant} &middot; {r.ocr.date} &middot; ${r.ocr.total} {r.ocr.currency}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {downloadKey && (
                <button onClick={downloadZip} style={downloadBtn}>
                  Download All as ZIP
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 16,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  border: "1px solid #e8eaed",
};

const smallBtn: React.CSSProperties = {
  padding: "5px 10px",
  border: "1px solid #d8dce0",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
  color: "#444",
};

const errorBox: React.CSSProperties = {
  background: "#fef0f0",
  border: "1px solid #f5c6c6",
  padding: 10,
  borderRadius: 6,
  marginBottom: 12,
  color: "#b00",
  fontSize: 13,
};

const downloadBtn: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 20px",
  background: "linear-gradient(135deg, #107c10, #1a9e1a)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 2px 6px rgba(16,124,16,0.25)",
  width: "100%",
};
