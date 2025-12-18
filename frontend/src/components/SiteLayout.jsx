import React, { useEffect, useMemo, useState } from "react";
import { Outlet, Link, NavLink, useLocation } from "react-router-dom";
import VapiWidget from "./VapiWidget.jsx";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "text-sm font-medium transition-colors",
          isActive ? "text-white" : "text-white/70 hover:text-white",
        ].join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

export default function SiteLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  // ✅ Choose assistant by section (Gov vs Business)
  const assistantId = useMemo(() => {
    const path = location.pathname || "/";
    const isGov = path.startsWith("/government");

    const GOV =
      import.meta.env.VITE_VAPI_ASSISTANT_ID_GOV ||
      import.meta.env.VITE_VAPI_ASSISTANT_ID_GOVERNMENT;

    const BIZ =
      import.meta.env.VITE_VAPI_ASSISTANT_ID_BIZ ||
      import.meta.env.VITE_VAPI_ASSISTANT_ID_BUSINESS;

    return isGov ? GOV : BIZ;
  }, [location.pathname]);

  // ✅ Logo with fallback (fixes missing /aspire1.png)
  const [logoSrc, setLogoSrc] = useState("/aspire1.png");

  return (
    <div className="min-h-screen text-white bg-gradient-to-b from-[#0B1224] via-[#070A12] to-[#070A12]">
      {/* softer premium glow */}
      <div className="pointer-events-none fixed inset-x-0 top-[-240px] mx-auto h-[560px] w-[980px] rounded-full bg-gradient-to-r from-blue-500/25 via-indigo-500/15 to-cyan-400/15 blur-3xl" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0A1020]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="Aspire"
              className="h-9 w-auto"
              onError={() => setLogoSrc("/aspire.png")} // fallback if aspire1.png not in /public
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">Aspire</div>
              <div className="text-xs text-white/60">
                ASPIRE™ Enterprise AI Framework
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <NavItem to="/agents">Agents</NavItem>
            <NavItem to="/framework">Framework</NavItem>
            <NavItem to="/government">Government</NavItem>
            <NavItem to="/business">Business</NavItem>
            <a
              href="/#contact"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Contact
            </a>
          </nav>

          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 md:hidden"
          >
            Menu
          </button>
        </div>

        {open && (
          <div className="border-t border-white/10 bg-[#0A1020]/95 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
              <Link className="text-white/80 hover:text-white" to="/agents">
                Agents
              </Link>
              <Link className="text-white/80 hover:text-white" to="/framework">
                Framework
              </Link>
              <Link className="text-white/80 hover:text-white" to="/government">
                Government
              </Link>
              <Link className="text-white/80 hover:text-white" to="/business">
                Business
              </Link>
              <a
                href="/#contact"
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Contact
              </a>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-10 text-sm text-white/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-white/85 font-semibold">
                ASPIRE™ Enterprise AI Framework
              </div>
              <div className="mt-1">
                Premium-grade AI agents for Government & Business.
              </div>
              <div className="mt-2 text-white/55">
                Security posture includes alignment to Essential Eight (Maturity Level 2) principles.
              </div>
              <div className="mt-3 text-white/55">
                Aspire Executive Solutions Pty Ltd — All rights reserved.
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <Link className="hover:text-white" to="/agents">
                Agents
              </Link>
              <Link className="hover:text-white" to="/framework">
                Framework
              </Link>
              <Link className="hover:text-white" to="/government">
                Government
              </Link>
              <Link className="hover:text-white" to="/business">
                Business
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ✅ Vapi widget on ALL pages (mount once) */}
      <VapiWidget assistantId={assistantId} />
    </div>
  );
}
