import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CollegeDuplicate,
  type CollegeExpenseDraft,
  type CollegePlan,
  type CollegeSubmitResponse,
  type ConvertCollegeExpenseResponse,
  type DriveItem,
  type DuplicateAction,
  type DuplicateResolution,
  type ScanCollegeResponse,
} from "@snapense/shared";
import { api } from "../api/client";
import { ImagePreview } from "./ImagePreview";
import { CollegeExpenseEditor, isDraftComplete } from "./CollegeExpenseEditor";

interface Breadcrumb { id: string | null; name: string }

const fileDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatFileDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : fileDateFormatter.format(date);
}

export function CollegeExpenseFlow({ plans, onOpenSettings }: { plans: CollegePlan[]; onOpenSettings: () => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const plan = plans.find((item) => item.id === planId) || plans[0];
  const [items, setItems] = useState<DriveItem[]>([]);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "My files" }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<CollegeExpenseDraft[]>([]);
  const [duplicates, setDuplicates] = useState<CollegeDuplicate[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, DuplicateResolution>>({});
  const [message, setMessage] = useState("");
  const [converting, setConverting] = useState<Set<string>>(new Set());
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1].id;

  const loadFolder = useCallback(async (folderId: string | null) => {
    setLoading(true); setError(""); setSelected(new Set());
    try {
      const data = await api.get<{ value: DriveItem[] }>(folderId ? `/api/drive/folder/${folderId}` : "/api/drive/root");
      setItems(data.value || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadFolder(currentFolderId); }, [currentFolderId, loadFolder]);

  const successfulDrafts = useMemo(() => drafts.filter((draft) => draft.status === "success"), [drafts]);
  const reviewComplete = successfulDrafts.length > 0 && successfulDrafts.every(isDraftComplete);

  if (!plan) return <div style={card}><h2 style={{ marginTop: 0 }}>Set up a 529 plan</h2><p style={muted}>Add a beneficiary and choose a OneDrive destination folder before scanning receipts.</p><button style={primaryBtn} onClick={onOpenSettings}>Open Settings</button></div>;

  async function scan() {
    setBusy(true); setError(""); setMessage(""); setDuplicates([]); setResolutions({});
    try {
      const data = await api.post<ScanCollegeResponse>("/api/529/scan", { fileIds: Array.from(selected) });
      setDrafts(data.drafts);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  function updateDraft(id: string, changes: Partial<CollegeExpenseDraft>) {
    const invalidatesConversion = "date" in changes || "amount" in changes ||
      "currency" in changes || "conversionMethod" in changes;
    setDrafts((all) => all.map((draft) => draft.id === id ? {
      ...draft,
      ...changes,
      ...(invalidatesConversion ? { usdAmount: undefined, conversion: undefined, conversionError: undefined } : {}),
    } : draft));
    setDuplicates([]); setResolutions({}); setMessage("");
  }

  async function refreshConversion(draft: CollegeExpenseDraft) {
    const inputs = { amount: draft.amount, currency: draft.currency, date: draft.date, conversionMethod: draft.conversionMethod };
    setConverting((current) => new Set(current).add(draft.id));
    updateDraft(draft.id, { conversionError: undefined });
    try {
      const conversion = await api.post<ConvertCollegeExpenseResponse>("/api/529/convert", {
        amount: inputs.amount,
        currency: inputs.currency,
        date: inputs.date,
      });
      setDrafts((all) => all.map((current) => current.id === draft.id &&
        current.amount === inputs.amount && current.currency === inputs.currency && current.date === inputs.date && current.conversionMethod === inputs.conversionMethod
        ? { ...current, ...conversion, conversionError: undefined }
        : current));
    } catch (err: any) {
      setDrafts((all) => all.map((current) => current.id === draft.id &&
        current.amount === inputs.amount && current.currency === inputs.currency && current.date === inputs.date && current.conversionMethod === inputs.conversionMethod
        ? { ...current, usdAmount: undefined, conversion: undefined, conversionError: err.message }
        : current));
    } finally {
      setConverting((current) => { const next = new Set(current); next.delete(draft.id); return next; });
    }
  }

  async function submit(reviewedResolutions = resolutions) {
    if (!successfulDrafts.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await api.post<CollegeSubmitResponse>("/api/529/submit", {
        folderId: plan.folderId,
        beneficiary: plan.name,
        drafts: successfulDrafts,
        resolutions: reviewedResolutions,
      });
      if (data.status === "duplicates") {
        setDuplicates(data.duplicates || []);
        setResolutions({});
      } else {
        setMessage(`${data.saved?.length || 0} expense${data.saved?.length === 1 ? "" : "s"} saved to ${plan.folderName}.`);
        setDrafts([]); setDuplicates([]); setResolutions({}); setSelected(new Set());
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  function chooseResolution(duplicate: CollegeDuplicate, action: DuplicateAction) {
    setResolutions((all) => ({ ...all, [duplicate.draftId]: { action, existingExpenseId: duplicate.existing.id } }));
  }

  const allResolved = duplicates.length > 0 && duplicates.every((duplicate) => resolutions[duplicate.draftId]);
  const folders = items.filter((item) => item.folder);
  const files = items.filter((item) => item.file);

  return <div>
    <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>529 expense submission</h2>
      <span style={{ flex: 1 }} />
      <label style={{ fontSize: 12, color: "#656d76" }}>Beneficiary&nbsp;
        <select style={select} value={plan.id} onChange={(event) => setPlanId(event.target.value)}>
          {plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <button style={secondaryBtn} onClick={onOpenSettings}>Settings</button>
    </div>
    {error && <div style={errorBox}>{error}</div>}
    {message && <div style={successBox}>{message}</div>}

    <div style={{ display: "grid", gridTemplateColumns: drafts.length ? "minmax(360px, .8fr) minmax(460px, 1.2fr)" : "1fr", gap: 16, alignItems: "start" }}>
      <div style={card}>
        <div style={{ fontSize: 12, color: "#656d76", marginBottom: 10 }}>Receipts can come from any OneDrive folder. Reviewed copies will be saved to <strong>{plan.folderName}</strong>.</div>
        <nav style={{ marginBottom: 10, fontSize: 13 }}>{breadcrumbs.map((crumb, index) => <span key={`${crumb.id}-${index}`}>
          {index > 0 && <span style={{ color: "#8b949e" }}> / </span>}
          <button style={linkBtn} onClick={() => setBreadcrumbs((all) => all.slice(0, index + 1))}>{crumb.name}</button>
        </span>)}</nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button style={secondaryBtn} onClick={() => setSelected(new Set(files.map((file) => file.id)))}>Select all files</button>
          <button style={secondaryBtn} onClick={() => setSelected(new Set())}>Clear</button>
          <span style={muted}>{selected.size} selected</span><span style={{ flex: 1 }} />
          <button style={{ ...primaryBtn, opacity: selected.size && !busy ? 1 : .5 }} disabled={!selected.size || busy} onClick={scan}>{busy && !drafts.length ? "Scanning…" : "Scan for 529"}</button>
        </div>
        {loading ? <div style={empty}>Loading…</div> : <div style={{ maxHeight: "55vh", overflow: "auto" }}>
          <table aria-label="OneDrive files" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th scope="col" style={fileHeading}>File name</th>
              <th scope="col" style={{ ...fileHeading, width: 130 }} title="Date created in OneDrive">Date</th>
            </tr></thead>
            <tbody>
              {folders.map((item) => <tr key={item.id}>
                <td style={fileCell}><button style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 8, textAlign: "left", wordBreak: "break-word", fontSize: 13 }} onClick={() => setBreadcrumbs((all) => [...all, { id: item.id, name: item.name }])}><span style={{ color: "#54aeff" }} aria-hidden="true">●</span> {item.name}</button></td>
                <td style={{ ...fileCell, color: "#656d76", whiteSpace: "nowrap" }}>{formatFileDate(item.createdDateTime)}</td>
              </tr>)}
              {files.map((item) => <tr key={item.id} style={{ background: selected.has(item.id) ? "#ddf4ff" : "#fff" }}>
                <td style={fileCell}><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input id={`receipt-file-${item.id}`} type="checkbox" checked={selected.has(item.id)} onChange={() => setSelected((old) => { const next = new Set(old); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} />
                  <FileThumbnail key={item.thumbnails?.[0]?.small?.url || item.id} item={item} onPreview={(url) => setPreview({ name: item.name, url })} />
                  <label htmlFor={`receipt-file-${item.id}`} style={{ cursor: "pointer", wordBreak: "break-word" }}>{item.name}</label>
                </div></td>
                <td style={{ ...fileCell, color: "#656d76", whiteSpace: "nowrap" }}>{formatFileDate(item.createdDateTime)}</td>
              </tr>)}
              {!items.length && <tr><td colSpan={2} style={empty}>This folder is empty.</td></tr>}
            </tbody>
          </table>
        </div>}
      </div>

      {drafts.length > 0 && <div style={card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Review before submission</h3>
        <p style={{ ...muted, margin: "0 0 14px" }}>Correct every field below. Nothing is saved until you submit.</p>
        {drafts.map((draft) => draft.status === "error" ? <div key={draft.id} style={errorBox}><strong>{draft.originalName}</strong>: {draft.error} <button style={smallLink} onClick={() => setDrafts((all) => all.filter((item) => item.id !== draft.id))}>Remove</button></div> :
          <CollegeExpenseEditor key={draft.id} draft={draft} converting={converting.has(draft.id)} onConvert={() => refreshConversion(draft)} onChange={(changes) => updateDraft(draft.id, changes)} onRemove={() => setDrafts((all) => all.filter((item) => item.id !== draft.id))} />)}

        {duplicates.length > 0 && <div style={{ borderTop: "2px solid #bf8700", paddingTop: 14, marginTop: 14 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Possible duplicates need a decision</h3>
          <p style={{ ...muted, marginTop: 0 }}>These existing entries have the same date and amount.</p>
          {duplicates.map((duplicate) => {
            const incoming = successfulDrafts.find((draft) => draft.id === duplicate.draftId)!;
            const chosen = resolutions[duplicate.draftId]?.action;
            return <div key={duplicate.draftId} style={duplicateBox}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div><strong>Existing</strong><br />{duplicate.existing.date} · {duplicate.existing.amount.toFixed(2)} {duplicate.existing.currency}<br />{duplicate.existing.description}<br /><span style={muted}>{duplicate.existing.receiptFileName}</span></div>
                <div><strong>Incoming</strong><br />{incoming.date} · {Number(incoming.usdAmount).toFixed(2)} USD<br /><span style={muted}>Receipt: {Number(incoming.amount).toFixed(2)} {incoming.currency}</span><br />{incoming.description}<br /><span style={muted}>{incoming.originalName}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(["cancel", "replace", "copy"] as DuplicateAction[]).map((action) => <button key={action} style={{ ...secondaryBtn, background: chosen === action ? "#ddf4ff" : "#f6f8fa", borderColor: chosen === action ? "#0969da" : "#d1d9e0" }} onClick={() => chooseResolution(duplicate, action)}>{action === "copy" ? "Add another expense" : action === "replace" ? "Replace existing" : "Cancel incoming"}</button>)}
              </div>
            </div>;
          })}
          <button style={{ ...primaryBtn, width: "100%", opacity: allResolved && !busy ? 1 : .5 }} disabled={!allResolved || busy} onClick={() => submit()}>{busy ? "Saving…" : "Apply decisions and submit"}</button>
        </div>}

        {!duplicates.length && <>
          {!reviewComplete && successfulDrafts.length > 0 && <div style={{ color: "#9a6700", fontSize: 12, margin: "8px 0" }}>Complete the highlighted fields before submitting.</div>}
          <button style={{ ...primaryBtn, width: "100%", opacity: reviewComplete && !busy ? 1 : .5 }} disabled={!reviewComplete || busy} onClick={() => submit({})}>{busy ? "Saving…" : `Submit ${successfulDrafts.length} reviewed expense${successfulDrafts.length === 1 ? "" : "s"}`}</button>
        </>}
      </div>}
    </div>
    {preview && <ImagePreview name={preview.name} url={preview.url} onClose={() => setPreview(null)} />}
  </div>;
}

function FileThumbnail({ item, onPreview }: { item: DriveItem; onPreview: (url: string) => void }) {
  const [failed, setFailed] = useState(false);
  const thumbnails = item.thumbnails?.[0];
  const url = thumbnails?.small?.url || thumbnails?.medium?.url || thumbnails?.large?.url;
  if (!item.file?.mimeType.startsWith("image/") || !url || failed) return null;
  return <button type="button" aria-label={`Preview ${item.name}`} title="Click to enlarge" onClick={() => onPreview(thumbnails?.large?.url || thumbnails?.medium?.url || url)}
    style={{ padding: 0, width: 44, height: 44, flexShrink: 0, border: "1px solid #d1d9e0", borderRadius: 4, background: "#f6f8fa", cursor: "zoom-in", overflow: "hidden" }}>
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
  </button>;
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16 };
const muted: React.CSSProperties = { color: "#656d76", fontSize: 12 };
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: "7px 8px", border: "1px solid #d1d9e0", borderRadius: 6, color: "#1f2328", background: "#fff", fontSize: 13 };
const select: React.CSSProperties = { ...input, width: "auto", padding: "6px 8px" };
const primaryBtn: React.CSSProperties = { padding: "7px 14px", border: "1px solid #0860ca", borderRadius: 6, background: "#0969da", color: "#fff", cursor: "pointer", fontWeight: 600 };
const secondaryBtn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", color: "#1f2328", cursor: "pointer", fontSize: 12 };
const linkBtn: React.CSSProperties = { border: 0, background: "none", padding: 0, color: "#0969da", cursor: "pointer" };
const smallLink: React.CSSProperties = { ...linkBtn, fontSize: 12, color: "#cf222e" };
const fileHeading: React.CSSProperties = { padding: "8px 6px", textAlign: "left", color: "#656d76", fontWeight: 600, borderBottom: "1px solid #d1d9e0", position: "sticky", top: 0, background: "#fff" };
const fileCell: React.CSSProperties = { padding: "9px 6px", borderBottom: "1px solid #eaeef2", color: "#1f2328" };
const empty: React.CSSProperties = { padding: 24, textAlign: "center", color: "#656d76", fontSize: 13 };
const errorBox: React.CSSProperties = { background: "#ffebe9", border: "1px solid #ffcecb", color: "#a40e26", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
const successBox: React.CSSProperties = { background: "#dafbe1", border: "1px solid #aceebb", color: "#116329", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
const duplicateBox: React.CSSProperties = { border: "1px solid #d4a72c", background: "#fff8c5", padding: 12, borderRadius: 6, marginBottom: 10 };
