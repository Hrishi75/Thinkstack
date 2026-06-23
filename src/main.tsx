import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import App from "./App";
import StickyWindow from "./windows/StickyWindow";
import QuickCapture from "./windows/QuickCapture";

const params = new URLSearchParams(window.location.search);
const windowKind = params.get("window");

let root: React.ReactNode;
if (windowKind === "sticky") {
  document.body.classList.add("window-sticky");
  root = <StickyWindow id={params.get("id") ?? ""} />;
} else if (windowKind === "capture") {
  document.body.classList.add("window-capture");
  root = <QuickCapture />;
} else {
  root = <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{root}</React.StrictMode>
);
