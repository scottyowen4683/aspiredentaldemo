import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./index.css";                 // keep global styles
import App from "./App.jsx";          // your existing app
import AdminCalls from "./pages/admin.jsx"; // the admin page

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Admin dashboard */}
        <Route path="/admin" element={<AdminCalls />} />
        {/* Everything else goes to your existing app */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
