// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Admin from "./pages/admin.jsx";
import "./index.css"; // keep Tailwind / global styles

function GovernmentFallback() { return <App />; }
function BusinessFallback() { return <App />; }

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Home (your existing landing page) */}
        <Route path="/" element={<App />} />

        {/* Admin dashboard */}
        <Route path="/admin" element={<Admin />} />

        {/* Temporary fallbacks so these routes don’t break.
           If you later add real files at:
           frontend/src/pages/government.jsx
           frontend/src/pages/business.jsx
           you can import them here instead of the fallbacks. */}
        <Route path="/government" element={<GovernmentFallback />} />
        <Route path="/business" element={<BusinessFallback />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
