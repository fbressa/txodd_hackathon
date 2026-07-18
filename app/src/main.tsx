import { Buffer } from "buffer";
(window as any).Buffer = Buffer; // web3.js precisa do Buffer global no browser

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
