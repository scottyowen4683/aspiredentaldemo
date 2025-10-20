import React from "react";
import {
  Routes,
  Route,
  Outlet,
  useNavigate,
  Link,
} from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";
import Government from "./pages/government.jsx";
import Business from "./pages/business.jsx";

const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

/* ---------- SINGLE, CONSISTENT HEADER (all pages) ---------- */
function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="h-14 md:h-16 w-full px-4 sm:px-6 lg:px-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img
            src={ASPIRE_LOGO}
            alt="Aspire Executive Solutions"
            className="h-7 md:h-8 w-auto"
          />
        </Link>

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
  );
}

/* ---------- Shared Layout ---------- */
function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <AudienceModal />
      <Header />
      {/* Content below the single header */}
      <main className="flex-grow pt-6 md:pt-10 pb-20 px-4 sm:px-6 lg:px-10">
        <Outlet />
      </main>
    </div>
  );
}

/* ---------- Landing page ---------- */
function Landing() {
  const navigate = useNavigate();
  return (
    <div className="text-center">
      {/* Keep the big centered logo only on the landing hero if you like it;
          remove this <img> if you want *only* the top-left header logo. */}
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
