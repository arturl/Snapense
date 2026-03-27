import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { loginRequest } from "./auth/msalConfig";
import { FileBrowser } from "./components/FileBrowser";
import { Logo } from "./components/Logo";

export default function App() {
  const { instance, accounts } = useMsal();
  const userName = accounts[0]?.name || accounts[0]?.username || "";

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif", background: "#f6f8fa", minHeight: "100vh", color: "#1f2328" }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 24px", background: "#ffffff",
        borderBottom: "1px solid #d1d9e0",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo size={32} />
          <span style={{ fontSize: 17, fontWeight: 600 }}>Snapense</span>
        </div>
        <AuthenticatedTemplate>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#656d76" }}>{userName}</span>
            <button onClick={() => instance.logoutRedirect()} style={headerBtn}>
              Sign out
            </button>
          </div>
        </AuthenticatedTemplate>
      </header>

      <UnauthenticatedTemplate>
        <div style={{ textAlign: "center", marginTop: 120 }}>
          <Logo size={64} />
          <h2 style={{ fontWeight: 600, fontSize: 24, margin: "16px 0 8px", color: "#1f2328" }}>Snapense</h2>
          <p style={{ color: "#656d76", fontSize: 14, maxWidth: 380, margin: "0 auto 28px", lineHeight: 1.5 }}>
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
        <div style={{ padding: "16px 24px", maxWidth: 1280, margin: "0 auto" }}>
          <FileBrowser />
        </div>
      </AuthenticatedTemplate>
    </div>
  );
}

const headerBtn: React.CSSProperties = {
  padding: "5px 14px",
  border: "1px solid #d1d9e0",
  borderRadius: 6,
  background: "#f6f8fa",
  color: "#1f2328",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 24px",
  border: "1px solid rgba(27,31,36,0.15)",
  borderRadius: 6,
  background: "#0969da",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  boxShadow: "0 1px 0 rgba(27,31,36,0.04)",
};
