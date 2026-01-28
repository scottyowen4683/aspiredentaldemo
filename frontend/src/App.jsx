import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import SiteLayout from "./components/SiteLayout.jsx";

import Home from "./pages/Home.jsx";
import Government from "./pages/government.jsx";
import Business from "./pages/business.jsx";
import Admin from "./pages/admin.jsx";
import Framework from "./pages/framework.jsx";

// Agents
import Agents from "./pages/agents.jsx";
import AgentsVoice from "./pages/agents-voice.jsx";
import AgentsChat from "./pages/agents-chat.jsx";
import AgentsOutbound from "./pages/agents-outbound.jsx";

export default function App() {
  return (
    <Routes>
      {/* ✅ Layout ALWAYS wraps */}
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

        {/* Admin */}
        <Route path="admin" element={<Admin />} />

        {/* Fallback */}
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
