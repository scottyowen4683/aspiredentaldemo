import React, { useEffect, useState } from "react";
import { Outlet, Link, NavLink, useLocation } from "react-router-dom";

const LOGO = "/aspire1.png"; // you already have this in /frontend root per your repo screenshot

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

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* Top glow */}
      <div className="pointer-events-none fixed inset-x-0 top-[-220px] mx-auto h-[520px] w-[900px] rounded-full bg-gradient-to-r from-blue-600/30 via-indigo-500/20 to-cyan-400/20 blur-3xl" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#070A12]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={LOGO} alt="Aspire" className="h-9 w-auto" />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">
                Aspire
              </div>
              <div className="text-xs text-white/60">
                AI Agents for Government & Business
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <NavItem to="/government">Government</NavItem>
            <NavItem to="/business">Business</NavItem>
            <NavItem to="/ai-receptionist">Voice Demo</NavItem>
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
          <div className="border-t border-white/10 bg-[#070A12]/95 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
              <Link className="text-white/80 hover:text-white" to="/government">
                Government
              </Link>
              <Link className="text-white/80 hover:text-white" to="/business">
                Business
              </Link>
              <Link className="text-white/80 hover:text-white" to="/ai-receptionist">
                Voice Demo
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
              <div className="text-white/80 font-semibold">ASPIRE™ Enterprise AI Framework</div>
              <div className="mt-1">Luxury-grade AI agents. Built for delivery, governance, and scale.</div>
            </div>
            <div className="flex gap-6">
              <Link className="hover:text-white" to="/government">Government</Link>
              <Link className="hover:text-white" to="/business">Business</Link>
              <Link className="hover:text-white" to="/ai-receptionist">Voice Demo</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
