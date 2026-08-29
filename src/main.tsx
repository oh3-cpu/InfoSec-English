import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./session-styles.css";
import App from "./App";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
