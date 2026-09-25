import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@danfessler/trellis/style.css";
import "./styles/base.css";
import "./styles/landing.css";
import "./styles/docs.css";
import { App } from "./App";
import { installCopyHandler } from "./components/copy";
import { Router } from "./router";
import { ThemeProvider } from "./theme";

installCopyHandler();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <Router>
        <App />
      </Router>
    </ThemeProvider>
  </StrictMode>,
);
