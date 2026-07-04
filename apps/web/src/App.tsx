import { useState } from "react";
import { Handshake, History, Languages, LogOut, Plus, Wallet } from "lucide-react";
import { AmbientBackground, BottomNav } from "./ui/index.js";
import type { NavItem } from "./ui/index.js";
import { clearSession, loadSession } from "./lib/session.js";
import type { Session } from "./lib/session.js";
import { useI18n } from "./i18n/index.js";
import { LoginPage } from "./pages/LoginPage.js";
import { BalancesPage } from "./pages/BalancesPage.js";
import { ExpensesPage } from "./pages/ExpensesPage.js";
import { AddExpensePage } from "./pages/AddExpensePage.js";
import { SettlePage } from "./pages/SettlePage.js";
import s from "./App.module.css";

type Tab = "balances" | "history" | "add" | "settle";

function TopBar({ session, onLogout }: { session: Session | null; onLogout?: () => void }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={s.topbar}>
      <button
        type="button"
        className={s.chip}
        onClick={() => setLang(lang === "fa" ? "en" : "fa")}
        aria-label={lang === "fa" ? "English" : "فارسی"}
      >
        <Languages size={14} />
        {lang === "fa" ? "EN" : "فا"}
      </button>
      {session && onLogout && (
        <button type="button" className={s.chip} onClick={onLogout} aria-label={t("header.switchUser")}>
          <span className={s.chipName}>{session.displayName}</span>
          <LogOut size={14} />
        </button>
      )}
    </div>
  );
}

export function App() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(loadSession);
  const [tab, setTab] = useState<Tab>("balances");

  const logout = () => {
    clearSession();
    setSession(null);
    setTab("balances");
  };

  if (!session) {
    return (
      <>
        <AmbientBackground />
        <TopBar session={null} />
        <LoginPage onLogin={setSession} />
      </>
    );
  }

  const nav: NavItem[] = [
    { id: "balances", label: t("nav.balances"), icon: <Wallet size={22} /> },
    { id: "history", label: t("nav.history"), icon: <History size={22} /> },
    { id: "settle", label: t("nav.settle"), icon: <Handshake size={22} /> },
  ];
  const { groupId } = session;

  return (
    <>
      <AmbientBackground />
      <TopBar session={session} onLogout={logout} />
      {tab === "balances" && <BalancesPage groupId={groupId} onSettle={() => setTab("settle")} />}
      {tab === "history" && <ExpensesPage groupId={groupId} />}
      {tab === "add" && <AddExpensePage groupId={groupId} onDone={() => setTab("balances")} />}
      {tab === "settle" && <SettlePage groupId={groupId} />}

      <BottomNav
        items={nav}
        active={tab}
        onSelect={(id) => setTab(id as Tab)}
        fab={{
          label: t("nav.add"),
          icon: <Plus size={26} strokeWidth={2.5} />,
          active: tab === "add",
          onClick: () => setTab("add"),
        }}
      />
    </>
  );
}
