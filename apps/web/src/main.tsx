import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoot } from "@telegram-apps/telegram-ui";
import "@telegram-apps/telegram-ui/dist/styles.css";
import { App } from "./App.js";
import { getWebApp, initTelegram } from "./lib/telegram.js";

initTelegram();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const appearance = getWebApp()?.colorScheme ?? "light";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoot appearance={appearance}>
        <App />
      </AppRoot>
    </QueryClientProvider>
  </StrictMode>,
);
