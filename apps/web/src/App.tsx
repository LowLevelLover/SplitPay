import { useState } from "react";
import { Placeholder, Tabbar } from "@telegram-apps/telegram-ui";
import { getGroupIdFromUrl } from "./lib/telegram.js";
import { BalancesPage } from "./pages/BalancesPage.js";
import { ExpensesPage } from "./pages/ExpensesPage.js";
import { AddExpensePage } from "./pages/AddExpensePage.js";
import { SettlePage } from "./pages/SettlePage.js";

type Tab = "balances" | "history" | "add" | "settle";

export function App() {
  const groupId = getGroupIdFromUrl();
  const [tab, setTab] = useState<Tab>("balances");

  if (!groupId) {
    return (
      <Placeholder header="No group selected" description="Open SplitPay from your group chat." />
    );
  }

  return (
    <div style={{ paddingBottom: 72 }}>
      {tab === "balances" && <BalancesPage groupId={groupId} onSettle={() => setTab("settle")} />}
      {tab === "history" && <ExpensesPage groupId={groupId} />}
      {tab === "add" && <AddExpensePage groupId={groupId} onDone={() => setTab("balances")} />}
      {tab === "settle" && <SettlePage groupId={groupId} />}

      <Tabbar>
        <Tabbar.Item text="Balances" selected={tab === "balances"} onClick={() => setTab("balances")}>
          💰
        </Tabbar.Item>
        <Tabbar.Item text="History" selected={tab === "history"} onClick={() => setTab("history")}>
          🧾
        </Tabbar.Item>
        <Tabbar.Item text="Add" selected={tab === "add"} onClick={() => setTab("add")}>
          ➕
        </Tabbar.Item>
        <Tabbar.Item text="Settle" selected={tab === "settle"} onClick={() => setTab("settle")}>
          🤝
        </Tabbar.Item>
      </Tabbar>
    </div>
  );
}
