import { useEffect, useState } from "react";
import { Outlet, Link, NavLink, useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
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

export default function MarketingLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace("#", "");
    const el = document.getElementById(id);
    if (!el) return;
    const HEADER_OFFSET = 96;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const absoluteTop = rect.top + window.pageYOffset;
      const targetY = Math.max(absoluteTop - HEADER_OFFSET, 0);
      window.scrollTo({ top: targetY, left: 0, behavior: "smooth" });
    });
  }, [location.hash, location.pathname]);

  const [logoSrc, setLogoSrc] = useState("/aspire-mark.png");

  return (
    <div className="min-h-screen text-white bg-gradient-to-b from-[#0B1224] via-[#070A12] to-[#070A12]">
      <div className="pointer-events-none fixed inset-x-0 top-[-240px] mx-auto h-[560px] w-[980px] rounded-full bg-gradient-to-r from-blue-500/25 via-indigo-500/15 to-cyan-400/15 blur-3xl" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0A1020]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={logoSrc}
              alt="Aspire Executive Solutions"
              className="h-9 w-auto"
              onError={() => setLogoSrc("/aspire.png")}
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">Aspire</div>
              <div className="text-xs text-white/60">
                ASPIRE Enterprise AI Framework
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <NavItem to="/agents">Agents</NavItem>
            <NavItem to="/framework">Framework</NavItem>
            <NavItem to="/government">Government</NavItem>
            <NavItem to="/business">Business</NavItem>

            <Link
              to="/#contact"
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              Contact
            </Link>

            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              <LogIn className="h-4 w-4" />
              Login
            </Link>
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
              <Link
                to="/#contact"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 text-center"
              >
                Contact
              </Link>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                <LogIn className="h-4 w-4" />
                Login to Portal
              </Link>
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
              <div className="font-semibold text-white/85">
                ASPIRE Enterprise AI Framework
              </div>
              <div className="mt-1">
                Premium-grade AI agents for Government and Business.
              </div>
              <div className="mt-2 text-white/55">
                Security posture includes alignment to Essential Eight (Maturity
                Level 2) principles.
              </div>
              <div className="mt-3 text-white/55">
                Aspire Executive Solutions Pty Ltd. All rights reserved.
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
              <Link className="hover:text-white" to="/auth">
                Portal Login
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
