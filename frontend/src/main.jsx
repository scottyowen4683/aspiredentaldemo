import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Admin from "./pages/admin.jsx";

// Optional placeholders so /government and /business don’t error
function Government() { return <div className="p-8">Government page (placeholder)</div>; }
function Business() { return <div className="p-8">Business page (placeholder)</div>; }

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
