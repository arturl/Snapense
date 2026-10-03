import { useEffect, useMemo, useState } from "react";
import type { BulkUpdateCollegeExpenseDatesResponse, CollegeExpense, CollegeExpenseLedger, CollegePlan, UpdateCollegeExpenseDatesResponse } from "@snapense/shared";
import { api } from "../api/client";

export function CollegeHistory({ plans, onOpenSettings }: { plans: CollegePlan[]; onOpenSettings: () => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const plan = plans.find((item) => item.id === planId) || plans[0];
  const [ledger, setLedger] = useState<CollegeExpenseLedger>({ version: 2, expenses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportYear, setExportYear] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDates, setEditDates] = useState({ fidelityTransferDate: "", beneficiaryPaymentDate: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setLoading(true); setError(""); setSelectedIds(new Set()); setSummaryOpen(false);
    api.get<CollegeExpenseLedger>(`/api/529/ledger/${plan.folderId}`)
      .then(setLedger).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [plan?.folderId]);

  const groups = useMemo(() => {
    const result = new Map<string, CollegeExpense[]>();
    for (const expense of ledger.expenses) {
      const year = expense.date.slice(0, 4) || "Unknown";
      result.set(year, [...(result.get(year) || []), expense]);
    }
    return [...result.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [ledger]);
  const years = groups.map(([year]) => year);
  const selectedExpenses = useMemo(() => ledger.expenses
    .filter((expense) => selectedIds.has(expense.id))
    .sort((a, b) => a.date.localeCompare(b.date)), [ledger, selectedIds]);

  if (!plan) return <div style={card}><h2 style={{ marginTop: 0 }}>No 529 plans configured</h2><button style={primaryBtn} onClick={onOpenSettings}>Open Settings</button></div>;

  function startEditing(expense: CollegeExpense) {
    setEditingId(expense.id);
    setEditDates({
      fidelityTransferDate: expense.fidelityTransferDate || "",
      beneficiaryPaymentDate: expense.beneficiaryPaymentDate || "",
    });
    setError("");
  }

  async function saveDates(expenseId: string) {
    setSavingId(expenseId); setError("");
    try {
      const data = await api.patch<UpdateCollegeExpenseDatesResponse>(
        `/api/529/ledger/${encodeURIComponent(plan.folderId)}/expense/${encodeURIComponent(expenseId)}`,
        editDates
      );
      setLedger((current) => ({
        ...current,
        expenses: current.expenses.map((expense) => expense.id === expenseId ? data.expense : expense),
      }));
      setEditingId(null);
    } catch (err: any) { setError(err.message); }
    finally { setSavingId(null); }
  }

  async function openReceipt(expense: CollegeExpense) {
    const receiptWindow = window.open("about:blank", "_blank");
    setError("");
    try {
      const result = await api.get<{ webUrl: string }>(
        `/api/529/receipt-link/${encodeURIComponent(plan.folderId)}?name=${encodeURIComponent(expense.receiptFileName)}`
      );
      if (receiptWindow) {
        receiptWindow.opener = null;
        receiptWindow.location.replace(result.webUrl);
      } else {
        window.location.assign(result.webUrl);
      }
    } catch (err: any) {
      receiptWindow?.close();
      setError(err.message);
    }
  }

  function toggleSelected(expenseId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(expenseId) ? next.delete(expenseId) : next.add(expenseId);
      return next;
    });
  }

  async function copySummary() {
    const plainText = reimbursementPlainText(plan.name, selectedExpenses);
    const html = reimbursementHtml(plan.name, selectedExpenses);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        })]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      setCopyMessage("Copied to clipboard");
    } catch {
      setCopyMessage("Could not copy automatically. Select the summary text and copy it manually.");
    }
  }

  async function copySubject() {
    try {
      await navigator.clipboard.writeText(reimbursementSubject(selectedExpenses));
      setCopyMessage("Subject copied to clipboard");
    } catch {
      setCopyMessage("Could not copy the subject automatically.");
    }
  }

  async function createSummary() {
    setCopyMessage("");
    const needsDates = selectedExpenses.some((expense) =>
      !expense.fidelityTransferDate || !expense.beneficiaryPaymentDate
    );
    if (needsDates) {
      const today = localToday();
      const approved = window.confirm(
        `Set empty "Fidelity transfer" and "Paid to beneficiary" dates to today (${today}) for the selected expenses? Existing dates will be preserved.`
      );
      if (approved) {
        setSummaryBusy(true);
        try {
          const result = await api.patch<BulkUpdateCollegeExpenseDatesResponse>(
            `/api/529/ledger/${encodeURIComponent(plan.folderId)}/expenses/dates`,
            { expenseIds: selectedExpenses.map((expense) => expense.id), date: today }
          );
          const updated = new Map(result.expenses.map((expense) => [expense.id, expense]));
          setLedger((current) => ({
            ...current,
            expenses: current.expenses.map((expense) => updated.get(expense.id) || expense),
          }));
        } catch (err: any) {
          setCopyMessage(`Dates were not updated: ${err.message}`);
        } finally {
          setSummaryBusy(false);
        }
      }
    }
    setSummaryOpen(true);
  }

  function exportCsv() {
    const expenses = exportYear === "all" ? ledger.expenses : ledger.expenses.filter((expense) => expense.date.startsWith(exportYear));
    const headers = ["Year", "Date", "Fidelity transfer date", "Beneficiary payment date", "Beneficiary", "Merchant", "Original amount", "Original currency", "USD amount", "USD currency", "Conversion method", "FX rate (USD per original currency)", "FX requested date", "FX effective date", "FX source", "Provider", "FRED series", "FX source URL", "FX retrieved at", "Items", "Description", "Receipt filename"];
    const rows = expenses.map((expense) => [
      expense.date.slice(0, 4), expense.date, expense.fidelityTransferDate || "", expense.beneficiaryPaymentDate || "",
      expense.beneficiary, expense.merchant, (expense.originalAmount ?? expense.amount).toFixed(2),
      expense.originalCurrency || expense.currency, expense.amount.toFixed(2), expense.currency,
      expense.conversion?.method || "none", expense.conversion?.rate?.toString() || "",
      expense.conversion?.method === "fred" ? expense.conversion.requestedDate : "",
      expense.conversion?.effectiveDate || "", expense.conversion?.source || "",
      expense.conversion?.method === "bank" ? expense.conversion.provider || "" : "",
      expense.conversion?.method === "fred" ? expense.conversion.seriesId : "",
      expense.conversion?.method === "fred" ? expense.conversion.sourceUrl : "",
      expense.conversion?.method === "fred" ? expense.conversion.retrievedAt : "",
      expense.items.join("; "), expense.description, expense.receiptFileName,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(plan.name)}-529-expenses-${exportYear}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>529 expense history</h2><span style={{ flex: 1 }} />
      <label style={label}>Beneficiary <select style={select} value={plan.id} onChange={(event) => { setPlanId(event.target.value); setExportYear("all"); setEditingId(null); }}>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label style={label}>CSV period <select style={select} value={exportYear} onChange={(event) => setExportYear(event.target.value)}><option value="all">All years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button style={{ ...primaryBtn, opacity: ledger.expenses.length ? 1 : .5 }} disabled={!ledger.expenses.length} onClick={exportCsv}>Export CSV</button>
      <button style={{ ...primaryBtn, opacity: selectedExpenses.length && !summaryBusy ? 1 : .5 }} disabled={!selectedExpenses.length || summaryBusy} onClick={createSummary}>{summaryBusy ? "Updating dates…" : `Create reimbursement summary${selectedExpenses.length ? ` (${selectedExpenses.length})` : ""}`}</button>
      {selectedExpenses.length > 0 && <button style={smallBtn} onClick={() => setSelectedIds(new Set())}>Clear selection</button>}
    </div>
    {error && <div style={errorBox}>{error}</div>}
    {loading ? <div style={card}>Loading ledger…</div> : groups.length === 0 ? <div style={{ ...card, textAlign: "center", color: "#656d76", padding: 40 }}>No saved expenses for {plan.name} yet.</div> : groups.map(([year, expenses]) => {
      const totals = expenses.reduce<Record<string, number>>((result, expense) => {
        result[expense.currency] = (result[expense.currency] || 0) + expense.amount;
        return result;
      }, {});
      const totalText = Object.entries(totals).map(([currency, total]) =>
        total.toLocaleString("en-US", { style: "currency", currency })
      ).join(" + ");
      return <section key={year} style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}><h3 style={{ margin: 0, fontSize: 18 }}>{year}</h3><span style={{ flex: 1 }} /><span style={{ color: "#656d76", fontSize: 13 }}>{expenses.length} expense{expenses.length === 1 ? "" : "s"} · {totalText}</span></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={{ ...th, width: 34 }}>Select</th><th style={th}>Expense date</th><th style={th}>Fidelity transfer</th><th style={th}>Paid to beneficiary</th><th style={th}>Merchant</th><th style={th}>Items</th><th style={{ ...th, minWidth: 300 }}>Description</th><th style={th}>Receipt</th><th style={{ ...th, textAlign: "right" }}>Original</th><th style={{ ...th, width: 150 }}>FX audit</th><th style={{ ...th, textAlign: "right" }}>USD amount</th><th style={th}></th></tr></thead>
          <tbody>{expenses.map((expense) => {
            const editing = editingId === expense.id;
            return <tr key={expense.id}>
              <td style={td}><input aria-label={`Select ${expense.description}`} type="checkbox" checked={selectedIds.has(expense.id)} onChange={() => toggleSelected(expense.id)} /></td>
              <td style={td}>{expense.date}</td>
              <td style={td}>{editing ? <input aria-label="Fidelity transfer date" type="date" style={dateInput} value={editDates.fidelityTransferDate} onChange={(event) => setEditDates((dates) => ({ ...dates, fidelityTransferDate: event.target.value }))} /> : expense.fidelityTransferDate || "—"}</td>
              <td style={td}>{editing ? <input aria-label="Beneficiary payment date" type="date" style={dateInput} value={editDates.beneficiaryPaymentDate} onChange={(event) => setEditDates((dates) => ({ ...dates, beneficiaryPaymentDate: event.target.value }))} /> : expense.beneficiaryPaymentDate || "—"}</td>
              <td style={td}>{expense.merchant}</td><td style={td}>{expense.items.join(", ")}</td><td style={{ ...td, minWidth: 300 }}>{expense.description}</td><td style={td}><button type="button" style={receiptLink} title={expense.receiptFileName} onClick={() => openReceipt(expense)}>View receipt</button></td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{(expense.originalAmount ?? expense.amount).toFixed(2)} {expense.originalCurrency || expense.currency}</td>
              <td style={{ ...td, width: 150, maxWidth: 150, whiteSpace: "normal", overflowWrap: "anywhere", color: "#656d76", fontSize: 11 }}>{expense.conversion?.method === "fred" ? <>
                {expense.conversion.rate} USD/{expense.originalCurrency}<br />
                <a href={expense.conversion.sourceUrl} target="_blank" rel="noreferrer">FRED {expense.conversion.seriesId}</a> · {expense.conversion.effectiveDate}
              </> : expense.conversion?.method === "bank" ? <>
                {expense.conversion.rate.toFixed(8)} USD/{expense.originalCurrency}<br />
                Actual bank charge{expense.conversion.provider ? ` · ${expense.conversion.provider}` : ""} · {expense.conversion.effectiveDate}
              </> : "—"}</td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{expense.amount.toFixed(2)} {expense.currency}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{editing ? <><button style={smallPrimaryBtn} disabled={savingId === expense.id} onClick={() => saveDates(expense.id)}>{savingId === expense.id ? "Saving…" : "Save"}</button><button style={smallBtn} disabled={savingId === expense.id} onClick={() => setEditingId(null)}>Cancel</button></> : <button style={smallBtn} onClick={() => startEditing(expense)}>Edit dates</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>;
    })}
    {summaryOpen && selectedExpenses.length > 0 && <ReimbursementSummary
      beneficiary={plan.name}
      expenses={selectedExpenses}
      copyMessage={copyMessage}
      onCopy={copySummary}
      onCopySubject={copySubject}
      onClose={() => setSummaryOpen(false)}
    />}
  </div>;
}

function ReimbursementSummary({ beneficiary, expenses, copyMessage, onCopy, onCopySubject, onClose }: {
  beneficiary: string;
  expenses: CollegeExpense[];
  copyMessage: string;
  onCopy: () => void;
  onCopySubject: () => void;
  onClose: () => void;
}) {
  const totals = reimbursementTotals(expenses);
  const subject = reimbursementSubject(expenses);
  return <div style={modalOverlay} role="dialog" aria-modal="true" aria-label="Reimbursement summary">
    <div style={modalCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>Reimbursement summary</h3>
        <span style={{ flex: 1 }} />
        <button style={smallBtn} onClick={onClose}>Close</button>
      </div>
      <div style={subjectBox}>
        <div><span style={{ color: "#656d76", fontSize: 11, fontWeight: 600 }}>EMAIL SUBJECT</span><br /><strong>{subject}</strong></div>
        <button style={smallBtn} onClick={onCopySubject}>Copy subject</button>
      </div>
      <div style={emailPreview}>
        <p>Hi {beneficiary},</p>
        <p>Here is the summary of the reimbursement you're getting. Details:</p>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0" }}>
          <thead><tr><th style={summaryTh}>Date</th><th style={summaryTh}>Description</th><th style={{ ...summaryTh, textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>{expenses.map((expense) => <tr key={expense.id}>
            <td style={{ ...summaryTd, whiteSpace: "nowrap" }}>{expense.date}</td>
            <td style={summaryTd}>{expense.description}</td>
            <td style={{ ...summaryTd, textAlign: "right", whiteSpace: "nowrap" }}>{formatMoney(expense.originalAmount ?? expense.amount, expense.originalCurrency || expense.currency)}</td>
          </tr>)}</tbody>
        </table>
        <p>The total amount is <strong>{totals.original} / {totals.usd}</strong>.</p>
        <hr style={{ border: 0, borderTop: "1px solid #d1d9e0", marginTop: 24 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 14, gap: 10 }}>
        <button style={primaryBtn} onClick={onCopy}>Copy summary</button>
        {copyMessage && <span style={{ color: copyMessage.toLowerCase().includes("copied") ? "#116329" : "#a40e26", fontSize: 12 }}>{copyMessage}</span>}
      </div>
    </div>
  </div>;
}

function reimbursementTotals(expenses: CollegeExpense[]): { original: string; usd: string } {
  const originals = expenses.reduce<Record<string, number>>((result, expense) => {
    const currency = expense.originalCurrency || expense.currency;
    result[currency] = (result[currency] || 0) + (expense.originalAmount ?? expense.amount);
    return result;
  }, {});
  return {
    original: Object.entries(originals).map(([currency, amount]) => formatMoney(amount, currency)).join(" + "),
    usd: formatMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0), "USD"),
  };
}

function reimbursementSubject(expenses: CollegeExpense[]): string {
  const totals = reimbursementTotals(expenses);
  return `Reimbursement for ${expenses.length} expense${expenses.length === 1 ? "" : "s"}, total ${totals.original} / ${totals.usd}`;
}

function reimbursementPlainText(beneficiary: string, expenses: CollegeExpense[]): string {
  const totals = reimbursementTotals(expenses);
  const rows = expenses.map((expense) =>
    `${expense.date}\t${expense.description}\t${formatMoney(expense.originalAmount ?? expense.amount, expense.originalCurrency || expense.currency)}`
  );
  return [
    `Hi ${beneficiary},`, "", "Here is the summary of the reimbursement you're getting. Details:", "",
    "Date\tDescription\tAmount", ...rows, "",
    `The total amount is ${totals.original} / ${totals.usd}.`, "", "---",
  ].join("\n");
}

function reimbursementHtml(beneficiary: string, expenses: CollegeExpense[]): string {
  const totals = reimbursementTotals(expenses);
  const rows = expenses.map((expense) => `<tr><td style="padding:6px 8px;border:1px solid #d1d9e0;white-space:nowrap">${escapeHtml(expense.date)}</td><td style="padding:6px 8px;border:1px solid #d1d9e0">${escapeHtml(expense.description)}</td><td style="padding:6px 8px;border:1px solid #d1d9e0;text-align:right;white-space:nowrap">${escapeHtml(formatMoney(expense.originalAmount ?? expense.amount, expense.originalCurrency || expense.currency))}</td></tr>`).join("");
  return `<div><p>Hi ${escapeHtml(beneficiary)},</p><p>Here is the summary of the reimbursement you're getting. Details:</p><table style="border-collapse:collapse"><thead><tr><th style="padding:6px 8px;border:1px solid #d1d9e0;text-align:left">Date</th><th style="padding:6px 8px;border:1px solid #d1d9e0;text-align:left">Description</th><th style="padding:6px 8px;border:1px solid #d1d9e0;text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><p>The total amount is <strong>${escapeHtml(totals.original)} / ${escapeHtml(totals.usd)}</strong>.</p><hr></div>`;
}

function formatMoney(amount: number, currency: string): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
}

function localToday(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function csvCell(value: string): string { return `"${String(value).replace(/"/g, '""')}"`; }
function safeName(value: string): string { return value.trim().replace(/[^a-zA-Z0-9-]+/g, "-") || "beneficiary"; }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16 };
const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#656d76" };
const select: React.CSSProperties = { border: "1px solid #d1d9e0", borderRadius: 6, padding: "6px 8px", background: "#fff" };
const primaryBtn: React.CSSProperties = { padding: "7px 14px", border: "1px solid #0860ca", borderRadius: 6, background: "#0969da", color: "#fff", cursor: "pointer", fontWeight: 600 };
const smallBtn: React.CSSProperties = { padding: "5px 8px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", color: "#1f2328", cursor: "pointer", fontSize: 11, marginLeft: 5 };
const smallPrimaryBtn: React.CSSProperties = { ...smallBtn, borderColor: "#0860ca", background: "#0969da", color: "#fff" };
const dateInput: React.CSSProperties = { border: "1px solid #d1d9e0", borderRadius: 6, padding: "5px 6px", fontSize: 12 };
const receiptLink: React.CSSProperties = { border: 0, background: "none", color: "#0969da", cursor: "pointer", padding: 0, font: "inherit", whiteSpace: "nowrap", textDecoration: "underline" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(31, 35, 40, .45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modalCard: React.CSSProperties = { width: "min(820px, 95vw)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 8, boxShadow: "0 12px 36px rgba(0, 0, 0, .25)", padding: 20 };
const emailPreview: React.CSSProperties = { border: "1px solid #d1d9e0", borderRadius: 6, padding: "18px 22px", color: "#1f2328", fontSize: 14, lineHeight: 1.5, background: "#fff" };
const subjectBox: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, border: "1px solid #d1d9e0", borderRadius: 6, padding: "10px 12px", marginBottom: 12, background: "#f6f8fa", fontSize: 13 };
const summaryTh: React.CSSProperties = { padding: "7px 8px", border: "1px solid #d1d9e0", textAlign: "left", background: "#f6f8fa" };
const summaryTd: React.CSSProperties = { padding: "7px 8px", border: "1px solid #d1d9e0", verticalAlign: "top" };
const th: React.CSSProperties = { padding: "8px", borderBottom: "1px solid #d1d9e0", textAlign: "left", fontSize: 12 };
const td: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid #eaeef2", verticalAlign: "top" };
const errorBox: React.CSSProperties = { background: "#ffebe9", border: "1px solid #ffcecb", color: "#a40e26", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
