import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Home from "./pages/Home.jsx";
import AiReceptionist from "./pages/AiReceptionist.jsx";
import { Toaster } from "sonner";

export default function App() {
  return (
    <BrowserRouter>
      {/* Simple top nav */}
      <nav style={{ padding: "12px 16px", borderBottom: "1px solid #eee" }}>
        <Link to="/" style={{ marginRight: 16 }}>Home</Link>
        <Link to="/ai-receptionist" style={{ marginRight: 16 }}>AI Receptionist</Link>
        <a
          href="https://calendly.com/scott-owen-aspire/ai-receptionist-demo"
          style={{ fontWeight: 700 }}
        >
          Book Demo
        </a>
      </nav>

      {/* Route handling */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ai-receptionist" element={<AiReceptionist />} />
      </Routes>

      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
