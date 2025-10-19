import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Your existing app entry (leave as-is if you already have it)
import App from "./App.jsx";

// The admin page we created earlier
import AdminCalls from "./pages/admin.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* NEW: admin dashboard route */}
        <Route path="/admin" element={<AdminCalls />} />import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// ✅ Keep your global styles (Tailwind, base CSS, fonts, etc.)
import "./index.css";

// ✅ Your existing app entry — leave your App.jsx as-is
import App from "./App.jsx";

// ✅ The admin page we added
import AdminCalls from "./pages/admin.jsx";

// ⚠️ If you previously wrapped <App /> in providers (ThemeProvider, QueryClientProvider, etc.)
// keep those wrappers INSIDE App.jsx so they still apply across the whole site.

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* NEW: admin dashboard route */}
        <Route path="/admin" element={<AdminCalls />} />

        {/* Everything else uses your existing App (and its providers/styles) */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);


        {/* Everything else falls back to your existing app */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
