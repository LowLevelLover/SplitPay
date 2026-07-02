import { createRoot } from "react-dom/client";
import "./ui/tokens.css";
import "./ui/theme.css";
import { AmbientBackground } from "./ui/index.js";

// Ambient-only harness to inspect the sun + perspective grid geometry.
createRoot(document.getElementById("root")!).render(<AmbientBackground />);
