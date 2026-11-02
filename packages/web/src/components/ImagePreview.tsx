import { useEffect, useRef, useState } from "react";

export function ImagePreview({ name, url, loading, error, webUrl, onClose }: { name: string; url?: string; loading?: boolean; error?: string; webUrl?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="receipt-preview-title" onClose={() => { if (!dialog.current?.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    style={{ padding: 0, border: "1px solid #d1d9e0", borderRadius: 8, maxWidth: "90vw", maxHeight: "90vh", boxShadow: "0 12px 48px #0004" }}>
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 12 }}>
        <h3 id="receipt-preview-title" style={{ margin: 0, fontSize: 14, flex: 1, wordBreak: "break-word" }}>{name}</h3>
        <button type="button" autoFocus style={secondaryBtn} onClick={onClose}>Close</button>
      </div>
      {/\.pdf$/i.test(name) && url && <p style={{ ...muted, marginTop: 0 }}>First page preview</p>}
      {loading ? <p style={muted} role="status">Loading preview…</p> : error || failed || !url ? <p style={muted} role="status">{error || "A preview is unavailable for this file."}</p> :
        <img src={url} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ display: "block", maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", margin: "auto" }} />}
      {webUrl && <a href={webUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, color: "#0969da", fontSize: 13 }}>Open original in OneDrive</a>}
    </div>
  </dialog>;
}

const muted: React.CSSProperties = { color: "#656d76", fontSize: 12 };
const secondaryBtn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", color: "#1f2328", cursor: "pointer", fontSize: 12 };
