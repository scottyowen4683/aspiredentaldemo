// frontend/src/App.jsx
import React from "react";
import { Routes, Route, Outlet, useNavigate, Link } from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";

const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

/* ---------- Shared layout (header + container) ---------- */
function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Popup chooser still appears */}
      <AudienceModal />

      <header className="w-full py-6">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-10 w-auto" />
          </Link>

          {/* Quick switch: clears remembered audience and reopens modal */}
          <button
            onClick={() => {
              localStorage.removeItem("audience");
              window.location.reload();
            }}
            className="text-sm text-slate-600 hover:text-blue-600"
          >
            Switch audience
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 pt-10 pb-20 grid place-items-center">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------- Landing page (your existing content) ---------- */
function Landing() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl text-center">
      <img src={ASPIRE_LOGO} alt="Aspire Executive Solutions" className="h-14 w-auto mx-auto mb-6" />
      <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
        Welcome to Aspire Executive Solutions
      </h1>
      <p className="mt-3 text-lg text-slate-700">
        So we can best help, are you here for <strong>Government</strong> or <strong>Business</strong> solutions?
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => navigate("/government")}
          className="rounded-xl bg-blue-600 text-white px-6 py-3 hover:bg-blue-700"
        >
          Government Solutions
        </button>
        <button
          onClick={() => navigate("/business")}
          className="rounded-xl border border-slate-300 px-6 py-3 text-slate-800 hover:bg-white"
        >
          Business Solutions
        </button>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        You can change this choice anytime using “Switch audience” (top right).
      </p>
    </div>
  );
}

/* ---------- Government page (placeholder; replace with your real content if you have it) ---------- */
function GovernmentPage() {
  return (
    <div className="max-w-3xl text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Government Solutions</h2>
      <p className="mt-3 text-slate-700">
        Your government offerings go here. If you already have a component/page, plug it in below.
      </p>
      <div className="mt-6">
        <Link to="/" className="text-blue-600 hover:underline">← Back to Home</Link>
      </div>
    </div>
  );
}

/* ---------- Business page (placeholder; replace with your real content if you have it) ---------- */
function BusinessPage() {
  return (
    <div className="max-w-3xl text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Business Solutions</h2>
      <p className="mt-3 text-slate-700">
        Your business offerings go here. If you already have a component/page, plug it in below.
      </p>
      <div className="mt-6">
        <Link to="/" className="text-blue-600 hover:underline">← Back to Home</Link>
      </div>
    </div>
  );
}

/* ---------- App with nested routes ---------- */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="government" element={<GovernmentPage />} />
        <Route path="business" element={<BusinessPage />} />
        {/* Fallback to Landing for unknown paths under App */}
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
