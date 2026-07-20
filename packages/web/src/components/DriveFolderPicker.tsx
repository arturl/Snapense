import { useCallback, useEffect, useState } from "react";
import type { DriveItem } from "@snapense/shared";
import { api } from "../api/client";

interface Breadcrumb { id: string | null; name: string }

export function DriveFolderPicker({
  onChoose,
}: {
  onChoose: (folder: { id: string; name: string }) => void;
}) {
  const [items, setItems] = useState<DriveItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "My files" }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const current = breadcrumbs[breadcrumbs.length - 1];

  const load = useCallback(async (id: string | null) => {
    setLoading(true); setError("");
    try {
      const data = await api.get<{ value: DriveItem[] }>(id ? `/api/drive/folder/${id}` : "/api/drive/root");
      setItems((data.value || []).filter((item) => item.folder));
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(current.id); }, [current.id, load]);

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 13 }}>
          {breadcrumbs.map((crumb, index) => <span key={`${crumb.id}-${index}`}>
            {index > 0 && <span style={{ color: "#8b949e" }}> / </span>}
            <button type="button" onClick={() => setBreadcrumbs((all) => all.slice(0, index + 1))} style={linkBtn}>
              {crumb.name}
            </button>
          </span>)}
        </div>
        {current.id && <button type="button" style={primaryBtn} onClick={() => onChoose({ id: current.id!, name: current.name })}>
          Use this folder
        </button>}
      </div>
      {error && <div style={{ color: "#a40e26", fontSize: 13 }}>{error}</div>}
      {loading ? <div style={muted}>Loading folders…</div> : items.length === 0 ?
        <div style={muted}>No subfolders here. Navigate back or use the current folder.</div> :
        items.map((item) => <button key={item.id} type="button" style={folderRow}
          onClick={() => setBreadcrumbs((all) => [...all, { id: item.id, name: item.name }])}>
          <span style={{ color: "#54aeff" }}>●</span> {item.name}
        </button>)}
    </div>
  );
}

const box: React.CSSProperties = { border: "1px solid #d1d9e0", borderRadius: 6, padding: 12, background: "#fff" };
const muted: React.CSSProperties = { color: "#656d76", fontSize: 13, padding: 12 };
const linkBtn: React.CSSProperties = { border: 0, padding: 0, background: "none", color: "#0969da", cursor: "pointer" };
const folderRow: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "8px 6px", border: 0, borderTop: "1px solid #eaeef2", background: "#fff", cursor: "pointer", color: "#0969da" };
const primaryBtn: React.CSSProperties = { padding: "6px 12px", border: "1px solid #0860ca", borderRadius: 6, color: "#fff", background: "#0969da", cursor: "pointer", fontWeight: 600 };
