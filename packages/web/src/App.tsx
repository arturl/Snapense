import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { loginRequest } from "./auth/msalConfig";
import { FileBrowser } from "./components/FileBrowser";

export default function App() {
  const { instance, accounts } = useMsal();
  const userName = accounts[0]?.name || accounts[0]?.username || "";

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f5f6fa", minHeight: "100vh", color: "#1a1a2e" }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 24px", background: "#fff",
        borderBottom: "1px solid #e1e4e8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #0078d4, #005a9e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 16,
          }}>S</div>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3 }}>Snapense</span>
        </div>
        <AuthenticatedTemplate>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#555" }}>{userName}</span>
            <button onClick={() => instance.logoutRedirect()} style={headerBtn}>
              Sign out
            </button>
          </div>
        </AuthenticatedTemplate>
      </header>

      <UnauthenticatedTemplate>
        <div style={{ textAlign: "center", marginTop: 120 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #0078d4, #005a9e)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 28, marginBottom: 20,
          }}>S</div>
          <h2 style={{ fontWeight: 600, fontSize: 22, margin: "0 0 8px" }}>Receipt Expense Tracker</h2>
          <p style={{ color: "#666", marginBottom: 28, fontSize: 14, maxWidth: 400, margin: "0 auto 28px" }}>
            Sign in with your Microsoft account to browse OneDrive files,
            scan receipts, and organize expenses.
          </p>
          <button
            onClick={() => instance.loginRedirect(loginRequest)}
            style={primaryBtn}
          >
            Sign in with Microsoft
          </button>
        </div>
      </UnauthenticatedTemplate>

      <AuthenticatedTemplate>
        <div style={{ padding: "16px 24px" }}>
          <FileBrowser />
        </div>
      </AuthenticatedTemplate>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  padding: "5px 12px",
  border: "1px solid #d1d5da",
  borderRadius: 6,
  background: "#fff",
  color: "#444",
  cursor: "pointer",
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 28px",
  border: "none",
  borderRadius: 8,
  background: "linear-gradient(135deg, #0078d4, #005a9e)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
  boxShadow: "0 2px 8px rgba(0,120,212,0.3)",
};
