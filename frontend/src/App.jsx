import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import MoretonBayPilot from "./pages/pilots/moretonbay.jsx";

export default function App() {
  return (
    <Routes>
      {/* Serve pilot as the homepage */}
      <Route path="/" element={<MoretonBayPilot />} />

      {/* Anything else -> back to pilot */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
