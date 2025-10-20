import React from "react";
import { Routes, Route, Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";

import Government from "./pages/government.jsx";
import Business from "./pages/business.jsx";

const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

/* ---------- Shared layout (header + container) ---------- */
function Layout() {
  const { pathname } = useLocation();
  const showLogo = pathname === "/"; // only show logo on the landing page

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <AudienceModal />

      {/* Header */}
      <header className="sticky top-0 z-50 h-16 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          {showLogo && (
            <Link to="/" className="flex items-center gap-2">
              <img
                src={ASPIRE_LOGO}
                alt="Aspire Executive Solutions"
                className="h-8 sm:h-10 w-auto"
              />
            </Link>
          )}

          <button
            onClick={() => {
              localStorage.removeItem("audience");
              window.location.reload();
            }}
            className="text-xs sm:text-sm text-slate-600 hover:text-blue-600"
          >
            Switch audience
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-20">
        <div className="w-full max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/* ---------- Landing page ---------- */
function Landing() {
  const navigate = useNavigate();
  return (
    <div className="text-center px-4">
      <img
        src={ASPIRE_LOGO}
        alt="Aspire Executive Solutions"
        className="h-12 sm:h-14 w-auto mx-auto mb-6"
      />
      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
        Welcome to Aspire Executive Solutions
      </h1>
      <p className="mt-3 text-base sm:text-lg text-slate-700">
        So we can best help, are you here for{" "}
        <strong>Government</strong> or <strong>Business</strong> solutions?
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => navigate("/government")}
          className="rounded-xl bg-blue-600 text-white px-6 py-3 text-sm sm:text-base font-medium hover:bg-blue-700 transition"
        >
          Government Solutions
        </button>
        <button
          onClick={() => navigate("/business")}
          className="rounded-xl border border-slate-300 px-6 py-3 text-sm sm:text-base text-slate-800 hover:bg-white transition"
        >
          Business Solutions
        </button>
      </div>

      <p className="mt-4 text-xs sm:text-sm text-slate-500">
        You can change this choice anytime using “Switch audience” (top right).
      </p>
    </div>
  );
}

/* ---------- Routes ---------- */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="government" element={<Government />} />
        <Route path="business" element={<Business />} />
        <Route path="*" element={<Landing />} />
      </Route>
    </Routes>
  );
}
