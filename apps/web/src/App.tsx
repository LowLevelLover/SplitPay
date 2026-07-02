import { useState } from "react";
import { Handshake, History, Plus, Wallet } from "lucide-react";
import { AmbientBackground, BottomNav, EmptyState } from "./ui/index.js";
import type { NavItem } from "./ui/index.js";
import { getGroupIdFromUrl } from "./lib/telegram.js";
import { BalancesPage } from "./pages/BalancesPage.js";
import { ExpensesPage } from "./pages/ExpensesPage.js";
import { AddExpensePage } from "./pages/AddExpensePage.js";
import { SettlePage } from "./pages/SettlePage.js";

type Tab = "balances" | "history" | "add" | "settle";

const NAV: NavItem[] = [
  { id: "balances", label: "Balances", icon: <Wallet size={22} /> },
  { id: "history", label: "History", icon: <History size={22} /> },
  { id: "settle", label: "Settle", icon: <Handshake size={22} /> },
];

export function App() {
  const groupId = getGroupIdFromUrl();
  const [tab, setTab] = useState<Tab>("balances");

  return (
    <>
      <AmbientBackground />
      {!groupId ? (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <EmptyState icon={<Wallet size={30} />} title="No group selected">
            Open SplitPay from the button in your group chat to see balances and settle up.
          </EmptyState>
        </div>
      ) : (
        <>
          {tab === "balances" && <BalancesPage groupId={groupId} onSettle={() => setTab("settle")} />}
          {tab === "history" && <ExpensesPage groupId={groupId} />}
          {tab === "add" && <AddExpensePage groupId={groupId} onDone={() => setTab("balances")} />}
          {tab === "settle" && <SettlePage groupId={groupId} />}

          <BottomNav
            items={NAV}
            active={tab}
            onSelect={(id) => setTab(id as Tab)}
            fab={{
              label: "Add expense",
              icon: <Plus size={26} strokeWidth={2.5} />,
              active: tab === "add",
              onClick: () => setTab("add"),
            }}
          />
        </>
      )}
    </>
  );
}
