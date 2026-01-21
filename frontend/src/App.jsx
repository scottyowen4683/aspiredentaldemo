import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import MoretonBayPilot from "./pages/pilots/moretonbay.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MoretonBayPilot />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
