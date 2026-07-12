import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createDemoApi } from "./demo-api";
import "./styles.css";

if (!window.grokApi) {
  if (location.protocol === "http:" || location.protocol === "https:") {
    window.grokApi = createDemoApi();
  } else {
    throw new Error("Electron 预加载桥未能初始化");
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
