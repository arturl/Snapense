import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { useState } from "react";
import type { CollegePlan } from "@snapense/shared";
import { loginRequest } from "./auth/msalConfig";
import { FileBrowser } from "./components/FileBrowser";
import { Logo } from "./components/Logo";
import { CollegeExpenseFlow } from "./components/CollegeExpenseFlow";
import { CollegeHistory } from "./components/CollegeHistory";
import { CollegeSettings } from "./components/CollegeSettings";
import { loadPlans, savePlans } from "./college/plans";

type Page = "home" | "work" | "college" | "history" | "settings";

export default function App() {
  const { instance, accounts } = useMsal();
  const userName = accounts[0]?.name || accounts[0]?.username || "";
  const [page, setPage] = useState<Page>("home");
  const [plans, setPlans] = useState<CollegePlan[]>(loadPlans);

  function updatePlans(next: CollegePlan[]) {
    setPlans(next);
    savePlans(next);
  }

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif", background: "#f6f8fa", minHeight: "100vh", color: "#1f2328" }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 24px", background: "#ffffff",
        borderBottom: "1px solid #d1d9e0",
      }}>
        <button onClick={() => setPage("home")} style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: "none", cursor: "pointer", padding: 0 }}>
          <Logo size={32} />
          <span style={{ fontSize: 17, fontWeight: 600 }}>Snapense</span>
        </button>
        <AuthenticatedTemplate>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {page !== "home" && <button onClick={() => setPage("home")} style={headerBtn}>Home</button>}
            <button onClick={() => setPage("settings")} style={headerBtn}>Settings</button>
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
          {page === "home" && <Home plans={plans} navigate={setPage} />}
          {page === "work" && <FileBrowser />}
          {page === "college" && <CollegeExpenseFlow plans={plans} onOpenSettings={() => setPage("settings")} />}
          {page === "history" && <CollegeHistory plans={plans} onOpenSettings={() => setPage("settings")} />}
          {page === "settings" && <CollegeSettings plans={plans} onChange={updatePlans} />}
        </div>
      </AuthenticatedTemplate>
    </div>
  );
}

function Home({ plans, navigate }: { plans: CollegePlan[]; navigate: (page: Page) => void }) {
  return <div style={{ maxWidth: 900, margin: "48px auto" }}>
    <div style={{ textAlign: "center", marginBottom: 30 }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 26 }}>What would you like to do?</h1>
      <p style={{ margin: 0, color: "#656d76", fontSize: 14 }}>Choose an expense workflow after signing in.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      <HomeCard title="Work expenses" description="Scan and rename business receipts using the existing workflow." action="Submit work expenses" onClick={() => navigate("work")} />
      <HomeCard title="529 expenses" description={plans.length ? `Scan, review, and save receipts for ${plans.map((plan) => plan.name).join(" or ")}.` : "Configure a beneficiary and OneDrive folder, then submit reviewed receipts."} action={plans.length ? "Submit 529 expenses" : "Set up 529"} onClick={() => navigate(plans.length ? "college" : "settings")} />
      <HomeCard title="529 history" description="Browse expenses by calendar year and export them as CSV." action="View 529 history" onClick={() => navigate("history")} />
    </div>
  </div>;
}

function HomeCard({ title, description, action, onClick }: { title: string; description: string; action: string; onClick: () => void }) {
  return <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #d1d9e0", borderRadius: 8, padding: 20, minHeight: 170 }}>
    <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{title}</h2>
    <p style={{ color: "#656d76", fontSize: 13, lineHeight: 1.5, margin: 0, flex: 1 }}>{description}</p>
    <button style={{ ...primaryBtn, width: "100%" }} onClick={onClick}>{action}</button>
  </div>;
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
