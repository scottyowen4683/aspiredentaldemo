// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Admin from "./pages/admin.jsx";
import "./index.css"; // <- brings back Tailwind/styles

// Try to import real pages if they exist; otherwise fall back to App
let Government = App;
let Business = App;

try {
  // If you have these files, great:
  //   frontend/src/pages/government.jsx
  //   frontend/src/pages/business.jsx
  Government = (await import("./pages/government.jsx")).default;
} catch {}
try {
  Business = (await import("./pages/business.jsx")).default;
} catch {}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/government" element={<Government />} />
        <Route path="/business" element={<Business />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
