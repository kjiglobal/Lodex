import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";
import "@xterm/xterm/css/xterm.css";

window.addEventListener("error", () => window.lodex?.app.reportError("renderer-error"));
window.addEventListener("unhandledrejection", () => window.lodex?.app.reportError("unhandled-promise"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>,
);
