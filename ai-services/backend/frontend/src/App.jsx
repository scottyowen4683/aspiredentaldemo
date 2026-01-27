import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import SiteLayout from "./components/SiteLayout.jsx";

import Home from "./pages/Home.jsx";
import Government from "./pages/Government.jsx";
import Business from "./pages/Business.jsx";
import Framework from "./pages/Framework.jsx";

// Agents
import Agents from "./pages/Agents.jsx";
import AgentsVoice from "./pages/AgentsVoice.jsx";
import AgentsChat from "./pages/AgentsChat.jsx";
import AgentsOutbound from "./pages/AgentsOutbound.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SiteLayout />}>
        <Route index element={<Home />} />

        {/* Core */}
        <Route path="framework" element={<Framework />} />
        <Route path="government" element={<Government />} />
        <Route path="business" element={<Business />} />

        {/* Agents */}
        <Route path="agents" element={<Agents />} />
        <Route path="agents/voice" element={<AgentsVoice />} />
        <Route path="agents/chat" element={<AgentsChat />} />
        <Route path="agents/outbound" element={<AgentsOutbound />} />

        {/* Old demo path -> business */}
        <Route path="ai-receptionist" element={<Navigate to="/business" replace />} />

        {/* Fallback */}
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
