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
      {/* LEFT PANE */}
      <div style={{ flex: "1 1 55%", minWidth: 0 }}>
        <div style={card}>
          {/* Breadcrumbs */}
          <nav style={{ marginBottom: 12, fontSize: 13 }}>
            {breadcrumbs.map((bc, i) => (
              <span key={i}>
                {i > 0 && <span style={{ margin: "0 4px", color: "#8b949e" }}>/</span>}
                {i < breadcrumbs.length - 1 ? (
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); navigateToBreadcrumb(i); }}
                    style={{ color: "#0969da", textDecoration: "none" }}
                  >
                    {bc.name}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600, color: "#1f2328" }}>{bc.name}</span>
                )}
              </span>
            ))}
          </nav>

          {error && <div style={errorBox}>{error}</div>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
            <button onClick={selectAll} style={secondaryBtn}>Select all</button>
            <button onClick={selectNone} style={secondaryBtn}>Clear</button>
            <span style={{ color: "#656d76", fontSize: 12, marginLeft: 4 }}>
              {selected.size} selected
            </span>
            <div style={{ flex: 1 }} />
            <button
              onClick={processSelected}
              disabled={selected.size === 0 || processing}
              style={{
                ...primaryBtn,
                opacity: selected.size === 0 || processing ? 0.5 : 1,
                cursor: selected.size === 0 || processing ? "default" : "pointer",
              }}
            >
              {processing ? "Processing..." : "Process Receipts"}
            </button>
          </div>

          {/* File table */}
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#656d76" }}>Loading files...</div>
          ) : (
            <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #d1d9e0" }}>
                    <th style={{ ...th, width: 28 }}></th>
                    <th style={th}>Name</th>
                    <th style={{ ...th, width: 80 }}>Size</th>
                    <th style={{ ...th, width: 100 }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {folderItems.map((item) => (
                    <tr
                      key={item.id}
                      style={row}
                      onClick={() => navigateToFolder(item)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f8fa")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={td}></td>
                      <td style={{ ...td, color: "#0969da", fontWeight: 500, cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="#54aeff" style={{ verticalAlign: "text-bottom", marginRight: 6 }}>
                          <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/>
                        </svg>
                        {item.name}
                      </td>
                      <td style={{ ...td, color: "#656d76" }}>{item.folder?.childCount} items</td>
                      <td style={{ ...td, color: "#656d76" }}>{fmtDate(item.createdDateTime)}</td>
                    </tr>
                  ))}
                  {fileItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{ ...row, background: selected.has(item.id) ? "#ddf4ff" : undefined }}
                      onMouseEnter={(e) => { if (!selected.has(item.id)) e.currentTarget.style.background = "#f6f8fa"; }}
                      onMouseLeave={(e) => { if (!selected.has(item.id)) e.currentTarget.style.background = ""; }}
                    >
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          style={{ accentColor: "#0969da" }}
                        />
                      </td>
                      <td style={{ ...td, color: "#1f2328" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="#656d76" style={{ verticalAlign: "text-bottom", marginRight: 6 }}>
                          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>
                        </svg>
                        {item.name}
                      </td>
                      <td style={{ ...td, color: "#656d76" }}>{item.size ? fmtSize(item.size) : ""}</td>
                      <td style={{ ...td, color: "#656d76" }}>{fmtDate(item.createdDateTime)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#8b949e" }}>
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

      {/* RIGHT PANE */}
      <div style={{ flex: "1 1 45%", minWidth: 0 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#1f2328" }}>
            Processed Receipts
          </h3>

          {!results && !processing && (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#8b949e", fontSize: 13, lineHeight: 1.6 }}>
              Select files on the left and click<br />"Process Receipts" to get started.
            </div>
          )}

          {/* Progress */}
          {(processing || progressPct > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#656d76", marginBottom: 6 }}>{progressText}</div>
              <div style={{ height: 8, background: "#eaeef2", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progressPct}%`,
                    background: "#0969da",
                    borderRadius: 4,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          )}

          {/* Results */}
          {results && (
            <>
              <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
                {results.map((r, i) => (
                  <div key={i} style={{
                    padding: "10px 12px",
                    borderRadius: 6,
                    marginBottom: 6,
                    border: `1px solid ${r.status === "success" ? "#d1d9e0" : "#ffcecb"}`,
                    background: r.status === "success" ? "#ffffff" : "#ffebe9",
                  }}>
                    <div style={{ fontSize: 12, color: "#656d76", marginBottom: 2 }}>
                      {r.originalName}
                    </div>
                    <div style={{
                      fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                      fontWeight: 500, color: r.status === "success" ? "#1f2328" : "#a40e26",
                      wordBreak: "break-all",
                    }}>
                      {r.status === "success" ? r.newName : r.error}
                    </div>
                    {r.status === "success" && (r.ocr as any).summary && (
                      <div style={{ fontSize: 12, color: "#656d76", marginTop: 4, lineHeight: 1.4 }}>
                        {(r.ocr as any).summary}
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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ---- GitHub-style tokens ---- */

const card: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 6,
  padding: 16,
  border: "1px solid #d1d9e0",
};

const th: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#1f2328",
};

const td: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 13,
};

const row: React.CSSProperties = {
  borderBottom: "1px solid #eaeef2",
  cursor: "default",
};

const secondaryBtn: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid #d1d9e0",
  borderRadius: 6,
  background: "#f6f8fa",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
  color: "#1f2328",
};

const primaryBtn: React.CSSProperties = {
  padding: "6px 16px",
  border: "1px solid rgba(27,31,36,0.15)",
  borderRadius: 6,
  background: "#0969da",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
};

const errorBox: React.CSSProperties = {
  background: "#ffebe9",
  border: "1px solid #ffcecb",
  padding: 10,
  borderRadius: 6,
  marginBottom: 12,
  color: "#a40e26",
  fontSize: 13,
};

const downloadBtn: React.CSSProperties = {
  marginTop: 12,
  padding: "8px 16px",
  background: "#f6f8fa",
  color: "#1f2328",
  border: "1px solid #d1d9e0",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  width: "100%",
};
