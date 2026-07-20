import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CollegeDuplicate,
  type CollegeExpenseDraft,
  type CollegePlan,
  type CollegeSubmitResponse,
  type DriveItem,
  type DuplicateAction,
  type DuplicateResolution,
  type ScanCollegeResponse,
} from "@snapense/shared";
import { api } from "../api/client";

interface Breadcrumb { id: string | null; name: string }

export function CollegeExpenseFlow({ plans, onOpenSettings }: { plans: CollegePlan[]; onOpenSettings: () => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const plan = plans.find((item) => item.id === planId) || plans[0];
  const [items, setItems] = useState<DriveItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: null, name: "My files" }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<CollegeExpenseDraft[]>([]);
  const [duplicates, setDuplicates] = useState<CollegeDuplicate[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, DuplicateResolution>>({});
  const [message, setMessage] = useState("");
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
    setDrafts((all) => all.map((draft) => draft.id === id ? { ...draft, ...changes } : draft));
    setDuplicates([]); setResolutions({}); setMessage("");
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
          {folders.map((item) => <button key={item.id} style={itemRow} onClick={() => setBreadcrumbs((all) => [...all, { id: item.id, name: item.name }])}><span style={{ color: "#54aeff" }}>●</span> {item.name}</button>)}
          {files.map((item) => <label key={item.id} style={{ ...itemRow, background: selected.has(item.id) ? "#ddf4ff" : "#fff" }}>
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => setSelected((old) => { const next = new Set(old); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })} />
            <span style={{ wordBreak: "break-word" }}>{item.name}</span>
          </label>)}
          {!items.length && <div style={empty}>This folder is empty.</div>}
        </div>}
      </div>

      {drafts.length > 0 && <div style={card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Review before submission</h3>
        <p style={{ ...muted, margin: "0 0 14px" }}>Correct every field below. Nothing is saved until you submit.</p>
        {drafts.map((draft) => draft.status === "error" ? <div key={draft.id} style={errorBox}><strong>{draft.originalName}</strong>: {draft.error} <button style={smallLink} onClick={() => setDrafts((all) => all.filter((item) => item.id !== draft.id))}>Remove</button></div> :
          <DraftEditor key={draft.id} draft={draft} onChange={(changes) => updateDraft(draft.id, changes)} onRemove={() => setDrafts((all) => all.filter((item) => item.id !== draft.id))} />)}

        {duplicates.length > 0 && <div style={{ borderTop: "2px solid #bf8700", paddingTop: 14, marginTop: 14 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Possible duplicates need a decision</h3>
          <p style={{ ...muted, marginTop: 0 }}>These existing entries have the same date and amount.</p>
          {duplicates.map((duplicate) => {
            const incoming = successfulDrafts.find((draft) => draft.id === duplicate.draftId)!;
            const chosen = resolutions[duplicate.draftId]?.action;
            return <div key={duplicate.draftId} style={duplicateBox}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div><strong>Existing</strong><br />{duplicate.existing.date} · {duplicate.existing.amount.toFixed(2)} {duplicate.existing.currency}<br />{duplicate.existing.description}<br /><span style={muted}>{duplicate.existing.receiptFileName}</span></div>
                <div><strong>Incoming</strong><br />{incoming.date} · {Number(incoming.amount).toFixed(2)} {incoming.currency}<br />{incoming.description}<br /><span style={muted}>{incoming.originalName}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {(["cancel", "replace", "copy"] as DuplicateAction[]).map((action) => <button key={action} style={{ ...secondaryBtn, background: chosen === action ? "#ddf4ff" : "#f6f8fa", borderColor: chosen === action ? "#0969da" : "#d1d9e0" }} onClick={() => chooseResolution(duplicate, action)}>{action === "copy" ? "Add another expense" : action === "replace" ? "Replace existing" : "Cancel incoming"}</button>)}
              </div>
            </div>;
          })}
          <button style={{ ...primaryBtn, width: "100%", opacity: allResolved && !busy ? 1 : .5 }} disabled={!allResolved || busy} onClick={() => submit()}>{busy ? "Saving…" : "Apply decisions and submit"}</button>
        </div>}

        {!duplicates.length && <button style={{ ...primaryBtn, width: "100%", opacity: successfulDrafts.length && !busy ? 1 : .5 }} disabled={!successfulDrafts.length || busy} onClick={() => submit({})}>{busy ? "Saving…" : `Submit ${successfulDrafts.length} reviewed expense${successfulDrafts.length === 1 ? "" : "s"}`}</button>}
      </div>}
    </div>
  </div>;
}

function DraftEditor({ draft, onChange, onRemove }: { draft: CollegeExpenseDraft; onChange: (changes: Partial<CollegeExpenseDraft>) => void; onRemove: () => void }) {
  const extension = draft.originalName.includes(".") ? draft.originalName.slice(draft.originalName.lastIndexOf(".")) : "";
  const proposed = formatCollegeExpenseFilename(draft) + extension;
  return <div style={draftBox}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><strong style={{ fontSize: 13 }}>{draft.originalName}</strong><span style={{ flex: 1 }} /><button style={smallLink} onClick={onRemove}>Remove</button></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 110px 80px", gap: 9 }}>
      <Field label="Date"><input required type="date" style={input} value={draft.date} onChange={(event) => onChange({ date: event.target.value })} /></Field>
      <Field label="Merchant"><input required style={input} value={draft.merchant} onChange={(event) => onChange({ merchant: event.target.value })} /></Field>
      <Field label="Amount"><input required min="0" step="0.01" type="number" style={input} value={draft.amount} onChange={(event) => onChange({ amount: event.target.value })} /></Field>
      <Field label="Currency"><input required maxLength={3} style={input} value={draft.currency} onChange={(event) => onChange({ currency: event.target.value.toUpperCase() })} /></Field>
    </div>
    <Field label="Items purchased (comma-separated)"><input style={input} value={draft.items.join(", ")} onChange={(event) => onChange({ items: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
    <Field label="Description"><input required style={input} value={draft.description} onChange={(event) => onChange({ description: event.target.value })} /></Field>
    <div style={{ fontSize: 11, color: "#656d76", wordBreak: "break-all" }}>Saved filename: {proposed}</div>
  </div>;
}

function formatCollegeExpenseFilename(draft: CollegeExpenseDraft): string {
  const clean = (value: string) => value.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  const parsedAmount = Number(draft.amount);
  const amount = (Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : "0.00").replace(".", "-");
  return `${draft.date}-${clean(draft.merchant).slice(0, 60)}-${clean(draft.description).slice(0, 120)}-${amount}-${clean(draft.currency || "USD")}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#656d76", fontWeight: 600, marginBottom: 9 }}>{label}{children}</label>; }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16 };
const muted: React.CSSProperties = { color: "#656d76", fontSize: 12 };
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: "7px 8px", border: "1px solid #d1d9e0", borderRadius: 6, color: "#1f2328", background: "#fff", fontSize: 13 };
const select: React.CSSProperties = { ...input, width: "auto", padding: "6px 8px" };
const primaryBtn: React.CSSProperties = { padding: "7px 14px", border: "1px solid #0860ca", borderRadius: 6, background: "#0969da", color: "#fff", cursor: "pointer", fontWeight: 600 };
const secondaryBtn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", color: "#1f2328", cursor: "pointer", fontSize: 12 };
const linkBtn: React.CSSProperties = { border: 0, background: "none", padding: 0, color: "#0969da", cursor: "pointer" };
const smallLink: React.CSSProperties = { ...linkBtn, fontSize: 12, color: "#cf222e" };
const itemRow: React.CSSProperties = { boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 6px", border: 0, borderTop: "1px solid #eaeef2", textAlign: "left", background: "#fff", color: "#1f2328", cursor: "pointer", fontSize: 13 };
const empty: React.CSSProperties = { padding: 24, textAlign: "center", color: "#656d76", fontSize: 13 };
const errorBox: React.CSSProperties = { background: "#ffebe9", border: "1px solid #ffcecb", color: "#a40e26", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
const successBox: React.CSSProperties = { background: "#dafbe1", border: "1px solid #aceebb", color: "#116329", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
const draftBox: React.CSSProperties = { border: "1px solid #d1d9e0", background: "#f6f8fa", padding: 12, borderRadius: 6, marginBottom: 10 };
const duplicateBox: React.CSSProperties = { border: "1px solid #d4a72c", background: "#fff8c5", padding: 12, borderRadius: 6, marginBottom: 10 };
