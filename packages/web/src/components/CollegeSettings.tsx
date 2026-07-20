import { useState } from "react";
import type { CollegePlan } from "@snapense/shared";
import { DriveFolderPicker } from "./DriveFolderPicker";

export function CollegeSettings({ plans, onChange }: { plans: CollegePlan[]; onChange: (plans: CollegePlan[]) => void }) {
  const [newName, setNewName] = useState("");
  const [pickerFor, setPickerFor] = useState<string | "new" | null>(null);

  function chooseFolder(folder: { id: string; name: string }) {
    if (pickerFor === "new") {
      const name = newName.trim();
      if (!name) return;
      onChange([...plans, { id: crypto.randomUUID(), name, folderId: folder.id, folderName: folder.name }]);
      setNewName("");
    } else if (pickerFor) {
      onChange(plans.map((plan) => plan.id === pickerFor ? { ...plan, folderId: folder.id, folderName: folder.name } : plan));
    }
    setPickerFor(null);
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h2 style={heading}>529 Settings</h2>
      <p style={intro}>Each beneficiary has a separate OneDrive folder containing renamed receipts and an expenses.json ledger. These folder choices are saved only in this browser.</p>

      {plans.map((plan) => <div key={plan.id} style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, alignItems: "end" }}>
          <label style={label}>Beneficiary
            <input style={input} value={plan.name} onChange={(event) => onChange(plans.map((item) => item.id === plan.id ? { ...item, name: event.target.value } : item))} />
          </label>
          <label style={label}>OneDrive folder
            <input style={{ ...input, background: "#f6f8fa" }} value={plan.folderName} readOnly />
          </label>
          <button style={secondaryBtn} onClick={() => setPickerFor(pickerFor === plan.id ? null : plan.id)}>Change folder</button>
          <button style={dangerBtn} onClick={() => { if (window.confirm(`Remove the ${plan.name} plan from this browser? OneDrive files will not be deleted.`)) onChange(plans.filter((item) => item.id !== plan.id)); }}>Remove</button>
        </div>
        {pickerFor === plan.id && <div style={{ marginTop: 12 }}><DriveFolderPicker onChoose={chooseFolder} /></div>}
      </div>)}

      <div style={card}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Add a 529 plan</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
          <label style={{ ...label, flex: 1 }}>Beneficiary name
            <input style={input} value={newName} placeholder="Beneficiary name" onChange={(event) => setNewName(event.target.value)} />
          </label>
          <button disabled={!newName.trim()} style={{ ...secondaryBtn, opacity: newName.trim() ? 1 : .5 }} onClick={() => setPickerFor("new")}>Choose OneDrive folder</button>
        </div>
        {pickerFor === "new" && <div style={{ marginTop: 12 }}><DriveFolderPicker onChoose={chooseFolder} /></div>}
      </div>
    </div>
  );
}

const heading: React.CSSProperties = { margin: "0 0 8px", fontSize: 22 };
const intro: React.CSSProperties = { color: "#656d76", fontSize: 14, lineHeight: 1.5, margin: "0 0 18px" };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #d1d9e0", borderRadius: 6, padding: 16, marginBottom: 14 };
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, color: "#656d76", fontSize: 12, fontWeight: 600 };
const input: React.CSSProperties = { boxSizing: "border-box", width: "100%", border: "1px solid #d1d9e0", borderRadius: 6, padding: "8px 9px", background: "#fff", color: "#1f2328", fontSize: 13 };
const secondaryBtn: React.CSSProperties = { padding: "8px 12px", border: "1px solid #d1d9e0", borderRadius: 6, background: "#f6f8fa", cursor: "pointer", color: "#1f2328", fontWeight: 500 };
const dangerBtn: React.CSSProperties = { ...secondaryBtn, color: "#cf222e" };
