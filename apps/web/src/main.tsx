import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TonConnectUIProvider } from "@tonconnect/ui-react";
import "@fontsource-variable/orbitron";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "./ui/tokens.css";
import "./ui/theme.css";
import { App } from "./App.js";
import { initTelegram } from "./lib/telegram.js";

initTelegram();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </TonConnectUIProvider>
  </StrictMode>,
);
