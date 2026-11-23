import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { captureInstallPrompt } from "./lib/install";
import { captureReferral } from "./lib/invite";
import { registerServiceWorker } from "./lib/push";
import "./styles.css";

registerServiceWorker();
captureInstallPrompt();
captureReferral();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
