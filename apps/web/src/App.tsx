import { Placeholder } from "@telegram-apps/telegram-ui";
import { getGroupIdFromUrl } from "./lib/telegram.js";
import { BalancesPage } from "./pages/BalancesPage.js";

export function App() {
  const groupId = getGroupIdFromUrl();

  if (!groupId) {
    return (
      <Placeholder header="No group selected" description="Open SplitPay from your group chat." />
    );
  }

  return <BalancesPage groupId={groupId} />;
}
