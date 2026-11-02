import type { CollegeExpenseDraft } from "@snapense/shared";

export function CollegeExpenseEditor({ draft, converting, onConvert, onChange, onRemove, receiptFileName }: { draft: CollegeExpenseDraft; converting: boolean; onConvert: () => void; onChange: (changes: Partial<CollegeExpenseDraft>) => void; onRemove?: () => void; receiptFileName?: string }) {
  const extension = draft.originalName.includes(".") ? draft.originalName.slice(draft.originalName.lastIndexOf(".")) : "";
  const proposed = formatCollegeExpenseFilename(draft) + extension;
  const missingDate = !/^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  const missingMerchant = !draft.merchant.trim();
  const missingAmount = !Number.isFinite(Number(draft.amount)) || Number(draft.amount) <= 0;
  const missingCurrency = !/^[A-Za-z]{3}$/.test(draft.currency.trim());
  const missingItems = !draft.items.some((item) => item.trim());
  const missingDescription = !draft.description.trim();
  return <div style={draftBox}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><strong style={{ fontSize: 13 }}>{draft.originalName}</strong><span style={{ flex: 1 }} />{onRemove && <button style={smallLink} onClick={onRemove}>Remove</button>}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 9 }}>
      <Field label="Date"><input required type="date" style={fieldStyle(missingDate)} value={draft.date} onChange={(event) => onChange({ date: event.target.value })} /></Field>
      <Field label="Merchant"><input required style={fieldStyle(missingMerchant)} value={draft.merchant} onChange={(event) => onChange({ merchant: event.target.value })} /></Field>
      <Field label="Amount"><input required min="0.01" step="0.01" type="number" style={fieldStyle(missingAmount)} value={draft.amount} onChange={(event) => onChange({ amount: event.target.value })} /></Field>
      <Field label="Currency"><input required maxLength={3} style={fieldStyle(missingCurrency)} value={draft.currency} onChange={(event) => {
        const currency = event.target.value.toUpperCase();
        onChange({
          currency,
          conversionMethod: currency === "USD" ? "none" : draft.conversionMethod === "none" ? "fred" : draft.conversionMethod,
        });
      }} /></Field>
    </div>
    <Field label="Items purchased (comma-separated)"><input style={fieldStyle(missingItems)} value={draft.items.join(", ")} onChange={(event) => onChange({ items: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></Field>
    <Field label="Description"><input required style={fieldStyle(missingDescription)} value={draft.description} onChange={(event) => onChange({ description: event.target.value })} /></Field>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
      <Field label="Money moved from Fidelity (optional)"><input type="date" style={input} value={draft.fidelityTransferDate || ""} onChange={(event) => onChange({ fidelityTransferDate: event.target.value })} /></Field>
      <Field label="Money paid to beneficiary (optional)"><input type="date" style={input} value={draft.beneficiaryPaymentDate || ""} onChange={(event) => onChange({ beneficiaryPaymentDate: event.target.value })} /></Field>
    </div>
    {draft.currency.toUpperCase() !== "USD" && <Field label="USD conversion method">
      <select style={input} value={draft.conversionMethod === "bank" ? "bank" : "fred"} onChange={(event) => onChange({ conversionMethod: event.target.value as "fred" | "bank" })}>
        <option value="fred">FRED reference rate</option>
        <option value="bank">Actual USD paid by bank/card</option>
      </select>
    </Field>}
    {draft.conversionMethod === "bank" && draft.currency.toUpperCase() !== "USD" ? <div style={conversionBox}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, width: "100%" }}>
        <Field label="Actual USD charged"><input required min="0.01" step="0.01" type="number" style={fieldStyle(!Number.isFinite(Number(draft.usdAmount)) || Number(draft.usdAmount) <= 0)} value={draft.usdAmount || ""} onChange={(event) => onChange({ usdAmount: event.target.value, conversion: undefined, conversionError: undefined })} /></Field>
        <Field label="Bank/card provider (optional)"><input style={input} value={draft.bankProvider || ""} placeholder="e.g. Chase Visa" onChange={(event) => onChange({ bankProvider: event.target.value })} /></Field>
        <Field label="Posting date (optional)"><input type="date" style={input} value={draft.bankEffectiveDate || ""} onChange={(event) => onChange({ bankEffectiveDate: event.target.value })} /></Field>
        {draft.usdAmount && Number(draft.amount) > 0 && <div style={{ ...muted, gridColumn: "1 / -1" }}>Implied rate: {(Number(draft.usdAmount) / Number(draft.amount)).toFixed(8)} USD/{draft.currency.toUpperCase()}. The actual USD amount will be stored as the ledger amount.</div>}
      </div>
    </div> : <div style={conversionBox}>
      <div>
        <strong>USD ledger amount</strong><br />
        {draft.usdAmount ? <>
          <span style={{ fontSize: 16 }}>${Number(draft.usdAmount).toFixed(2)} USD</span>
          {draft.conversion?.method === "fred" && <div style={{ ...muted, marginTop: 3 }}>
            {Number(draft.amount).toFixed(2)} {draft.currency.toUpperCase()} × {draft.conversion.rate} USD/{draft.currency.toUpperCase()} · FRED {draft.conversion.seriesId}, observation {draft.conversion.effectiveDate} · <a href={draft.conversion.sourceUrl} target="_blank" rel="noreferrer">source</a>
          </div>}
          {!draft.conversion && <div style={{ ...muted, marginTop: 3 }}>No conversion needed for a USD receipt.</div>}
        </> : <span style={{ color: draft.conversionError ? "#a40e26" : "#9a6700", fontSize: 12 }}>{draft.conversionError || "Refresh the conversion after editing the date, amount, or currency."}</span>}
      </div>
      <button type="button" style={{ ...secondaryBtn, whiteSpace: "nowrap" }} disabled={converting || missingDate || missingAmount || missingCurrency} onClick={onConvert}>{converting ? "Converting…" : "Refresh USD conversion"}</button>
    </div>}
    <div style={{ fontSize: 11, color: "#656d76", wordBreak: "break-all" }}>Saved filename: {receiptFileName || proposed}</div>
  </div>;
}

export function isDraftComplete(draft: CollegeExpenseDraft): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && Boolean(
    draft.merchant.trim() && draft.description.trim() &&
    /^[A-Za-z]{3}$/.test(draft.currency.trim()) &&
    draft.items.some((item) => item.trim()) &&
    Number.isFinite(Number(draft.amount)) && Number(draft.amount) > 0 &&
    Number.isFinite(Number(draft.usdAmount)) && Number(draft.usdAmount) > 0
  );
}

function fieldStyle(invalid: boolean): React.CSSProperties {
  return invalid ? { ...input, borderColor: "#d4a72c", background: "#fff8c5" } : input;
}

function formatCollegeExpenseFilename(draft: CollegeExpenseDraft): string {
  const clean = (value: string) => value.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  const parsedAmount = Number(draft.amount);
  const amount = (Number.isFinite(parsedAmount) ? parsedAmount.toFixed(2) : "0.00").replace(".", "-");
  return `${draft.date}-${clean(draft.merchant).slice(0, 60)}-${clean(draft.description).slice(0, 120)}-${amount}-${clean(draft.currency || "USD")}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#656d76", fontWeight: 600, marginBottom: 9 }}>{label}{children}</label>; }

const muted: React.CSSProperties = { color: "#656d76", fontSize: 12 };
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", padding: "7px 8px", border: "1px solid #d1d9e0", borderRadius: 6, color: "#1f2328", background: "#fff", fontSize: 13 };
const secondaryBtn: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", color: "#1f2328", cursor: "pointer", fontSize: 12 };
const linkBtn: React.CSSProperties = { border: 0, background: "none", padding: 0, color: "#0969da", cursor: "pointer" };
const smallLink: React.CSSProperties = { ...linkBtn, fontSize: 12, color: "#cf222e" };
const draftBox: React.CSSProperties = { border: "1px solid #d1d9e0", background: "#f6f8fa", padding: 12, borderRadius: 6, marginBottom: 10 };
const conversionBox: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #b6d7a8", background: "#f0fff4", padding: 10, borderRadius: 6, marginBottom: 9 };
