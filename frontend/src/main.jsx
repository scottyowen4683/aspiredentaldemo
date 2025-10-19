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
        <Route path="/admin" element={<AdminCalls />} />

        {/* Everything else falls back to your existing app */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
