// frontend/src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";

import SiteLayout from "./components/SiteLayout.jsx";

import Home from "./pages/Home.jsx";
import Government from "./pages/government.jsx";
import Business from "./pages/business.jsx";
import AiReceptionist from "./pages/AiReceptionist.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />

        {/* Product-led pages (clean paths) */}
        <Route path="/government" element={<Government />} />
        <Route path="/business" element={<Business />} />

        {/* Kept demo page (we can rebrand this later into /demo or /agents/voice) */}
        <Route path="/ai-receptionist" element={<AiReceptionist />} />

        {/* Simple fallback */}
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
