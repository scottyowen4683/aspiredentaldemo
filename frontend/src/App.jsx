import React, { useState } from "react";
import {
  Routes,
  Route,
  Outlet,
  useNavigate,
  Link,
  useLocation,
} from "react-router-dom";
import AudienceModal from "./components/AudienceModal.jsx";

import Government from "./pages/government.jsx";
import Business from "./pages/business.jsx";

const ASPIRE_LOGO =
  "https://raw.githubusercontent.com/scottyowen4683/Aspirereception/refs/heads/feature/ai-receptionist/frontend/aspire.png";

/* ---------- Header (single source of truth) ---------- */
function Header() {
  const { pathname } = useLocation();
  const onLanding = pathname === "/";

  // Show the section nav on everything except the landing page
  const showSectionNav = !onLanding;

  const [open, setOpen] = useState(false);

  // Your section links (used for desktop inline + mobile drawer)
  const sectionLinks = [
    { href: "#how", label: "How it works" },
    { href: "#automations", label: "Smart Automations" },
    { href: "#why", label: "Why Aspire" },
    { href: "#capabilities", label: "Capabilities" },
    { href: "#advanced", label: "Advanced" },
    { href: "#demo", label: "Demo" },
    { href: "#roi", label: "ROI" },
    { href: "#pricing", label: "Pricing" },
    { href: "#privacy", label: "Privacy" },
    { href: "#faq", label: "FAQ" },
    { href: "#contact", label: "Contact" },
  ];

  return (
    <>
      {/* Top app bar */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        {/* Bar height is fixed; content vertically centered */}
        <div className="h-14 md:h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
          <div className="flex w-full items-center justify-between gap-3">
            {/* Brand (kept compact so it sits neatly inside the bar) */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img
                src={ASPIRE_LOGO}
                alt="Aspire Executive Solutions"
                className="h-7 md:h-8 w-auto"
              />
            </Link>

            {/* Desktop section nav (inline). Hidden on small screens. */}
            {showSectionNav && (
              <nav className="hidden md:block">
                <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.95rem] text-slate-800">
                  {sectionLinks.map((l) => (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        className="whitespace-nowrap hover:text-blue-700"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* Right actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  localStorage.removeItem("audience");
                  window.location.reload();
                }}
                className="hidden sm:inline text-sm text-slate-600 hover:text-blue-600"
              >
                Switch audience
              </button>

              {/* Mobile hamburger (only shows when section nav is relevant) */}
              {showSectionNav && (
                <button
                  aria-label="Open menu"
                  onClick={() => setOpen((v) => !v)}
                  className="inline-flex md:hidden items-center justify-center rounded-md p-2 ring-1 ring-slate-300 text-slate-700"
                >
                  {/* Simple hamburger icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile drawer for section links */}
        {showSectionNav && (
          <div
            className={`md:hidden overflow-hidden transition-[max-height] duration-300 ${
              open ? "max-h-96" : "max-h-0"
            }`}
          >
            <nav className="px-4 pb-3">
              <ul className="grid grid-cols-2 gap-3 text-slate-800">
                {sectionLinks.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      className="block w-full rounded-md px-3 py-2 hover:bg-slate-100"
                      onClick={() => setOpen(false)}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => {
                  localStorage.removeItem("audience");
                  window.location.reload();
                }}
                className="mt-3 inline-block w-full rounded-md px-3 py-2 text-left text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
              >
                Switch audience
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Spacer is handled by header height via sticky + the content block below. */}
    </>
  );
}

/* ---------- Shared Layout ---------- */
function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <AudienceModal />
      <Header />
      {/* Content area; no grid centering so it doesn’t “float” under header */}
      <main className="flex-grow px-4 sm:px-6 lg:px-8 pt-6 md:pt-8 pb-20">
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
    <div className="text-center">
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
