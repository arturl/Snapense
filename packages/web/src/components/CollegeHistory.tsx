import { useEffect, useMemo, useState } from "react";
import type { CollegeExpense, CollegeExpenseLedger, CollegePlan } from "@snapense/shared";
import { api } from "../api/client";

export function CollegeHistory({ plans, onOpenSettings }: { plans: CollegePlan[]; onOpenSettings: () => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const plan = plans.find((item) => item.id === planId) || plans[0];
  const [ledger, setLedger] = useState<CollegeExpenseLedger>({ version: 1, expenses: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportYear, setExportYear] = useState("all");

  useEffect(() => {
    if (!plan) return;
    setLoading(true); setError("");
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

  if (!plan) return <div style={card}><h2 style={{ marginTop: 0 }}>No 529 plans configured</h2><button style={primaryBtn} onClick={onOpenSettings}>Open Settings</button></div>;

  function exportCsv() {
    const expenses = exportYear === "all" ? ledger.expenses : ledger.expenses.filter((expense) => expense.date.startsWith(exportYear));
    const headers = ["Year", "Date", "Beneficiary", "Merchant", "Amount", "Currency", "Items", "Description", "Receipt filename"];
    const rows = expenses.map((expense) => [expense.date.slice(0, 4), expense.date, expense.beneficiary, expense.merchant, expense.amount.toFixed(2), expense.currency, expense.items.join("; "), expense.description, expense.receiptFileName]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(plan.name)}-529-expenses-${exportYear}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>529 expense history</h2><span style={{ flex: 1 }} />
      <label style={label}>Beneficiary <select style={select} value={plan.id} onChange={(event) => { setPlanId(event.target.value); setExportYear("all"); }}>{plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label style={label}>CSV period <select style={select} value={exportYear} onChange={(event) => setExportYear(event.target.value)}><option value="all">All years</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <button style={{ ...primaryBtn, opacity: ledger.expenses.length ? 1 : .5 }} disabled={!ledger.expenses.length} onClick={exportCsv}>Export CSV</button>
    </div>
    {error && <div style={errorBox}>{error}</div>}
    {loading ? <div style={card}>Loading ledger…</div> : groups.length === 0 ? <div style={{ ...card, textAlign: "center", color: "#656d76", padding: 40 }}>No saved expenses for {plan.name} yet.</div> : groups.map(([year, expenses]) => {
      const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      return <section key={year} style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 10 }}><h3 style={{ margin: 0, fontSize: 18 }}>{year}</h3><span style={{ flex: 1 }} /><span style={{ color: "#656d76", fontSize: 13 }}>{expenses.length} expense{expenses.length === 1 ? "" : "s"} · {total.toLocaleString("en-US", { style: "currency", currency: expenses[0]?.currency || "USD" })}</span></div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th style={th}>Date</th><th style={th}>Merchant</th><th style={th}>Items</th><th style={th}>Description</th><th style={th}>Receipt</th><th style={{ ...th, textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>{expenses.map((expense) => <tr key={expense.id}><td style={td}>{expense.date}</td><td style={td}>{expense.merchant}</td><td style={td}>{expense.items.join(", ")}</td><td style={td}>{expense.description}</td><td style={{ ...td, wordBreak: "break-all", color: "#656d76" }}>{expense.receiptFileName}</td><td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{expense.amount.toFixed(2)} {expense.currency}</td></tr>)}</tbody>
        </table></div>
      </section>;
    })}
  </div>;
}

function csvCell(value: string): string { return `"${String(value).replace(/"/g, '""')}"`; }
function safeName(value: string): string { return value.trim().replace(/[^a-zA-Z0-9-]+/g, "-") || "beneficiary"; }

const card: React.CSSProperties = { background: "#fff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16 };
const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#656d76" };
const select: React.CSSProperties = { border: "1px solid #d1d9e0", borderRadius: 6, padding: "6px 8px", background: "#fff" };
const primaryBtn: React.CSSProperties = { padding: "7px 14px", border: "1px solid #0860ca", borderRadius: 6, background: "#0969da", color: "#fff", cursor: "pointer", fontWeight: 600 };
const th: React.CSSProperties = { padding: "8px", borderBottom: "1px solid #d1d9e0", textAlign: "left", fontSize: 12 };
const td: React.CSSProperties = { padding: "9px 8px", borderBottom: "1px solid #eaeef2", verticalAlign: "top" };
const errorBox: React.CSSProperties = { background: "#ffebe9", border: "1px solid #ffcecb", color: "#a40e26", padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
