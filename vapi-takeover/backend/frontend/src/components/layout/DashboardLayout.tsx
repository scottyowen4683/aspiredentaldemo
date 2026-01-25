import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Flag,
  Users,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Sun,
  Moon,
  FileText,
  Phone,
  BookOpen,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";

interface DashboardLayoutProps {
  children: ReactNode;
  userRole?: "super_admin" | "org_admin";
  userName?: string;
}

export function DashboardLayout({ children, userRole = "org_admin", userName = "User" }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useUser();
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', next);
    } catch (e) {
      // ignore
    }
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Keep theme state in sync if something else toggles the root class (e.g. persisted value applied in main.tsx)
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const mobileRef = useRef<HTMLDivElement | null>(null);

  // Close mobile drawer on outside click
  useEffect(() => {
    if (!mobileOpen) return;
    function handleOutside(e: MouseEvent) {
      if (!mobileRef.current) return;
      if (!mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [mobileOpen]);

  // Close mobile drawer on navigation change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);


  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "org_admin"] },
    { name: "Conversations", href: "/conversations", icon: MessageSquare, roles: ["super_admin", "org_admin"] },
    { name: "Assistants", href: "/assistants", icon: Bot, roles: ["super_admin", "org_admin"] },
    { name: "Campaigns", href: "/campaigns", icon: Phone, roles: ["super_admin", "org_admin"] },
    { name: "Knowledge Base", href: "/knowledge-base", icon: BookOpen, roles: ["super_admin", "org_admin"] },
    { name: "Review Queue", href: "/review-queue", icon: Flag, roles: ["super_admin", "org_admin"] },
    // Organizations should be visible to both super_admin (manage all orgs)
    // and org_admin (see their assigned org). The Organizations page will
    // enforce filtering for org_admins.
    { name: "Organizations", href: "/organizations", icon: Users, roles: ["super_admin", "org_admin"] },
    // Invites: only visible to super_admin
    { name: "Invites", href: "/invites", icon: Flag, roles: ["super_admin"] },
    { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["super_admin", "org_admin"] },
    { name: "Billing", href: "/billing", icon: CreditCard, roles: ["super_admin"] },
    { name: "Users", href: "/users", icon: Users, roles: ["super_admin"] },
    // Audit Logs: only visible to super_admin
    { name: "Audit Logs", href: "/audit-logs", icon: FileText, roles: ["super_admin"] },
    // Settings: only visible to super_admin
    { name: "Settings", href: "/settings", icon: Settings, roles: ["super_admin"] },
  ];

  // Determine which nav items to show.
  // Requirement: when an org_admin is on the main /dashboard page, show a reduced set.
  // When an org_admin is on other pages, show the extended menu (including org-level items).
  // Start by filtering by role
  let filteredNavigation = navigation.filter((item) => item.roles.includes(userRole));

  // Further reduce for org_admin on dashboard page
  if (userRole === "org_admin" && location.pathname === "/dashboard") {
    const allowedNames = ["Dashboard", "Conversations", "Assistants", "Campaigns", "Knowledge Base", "Review Queue", "Organizations",];
    filteredNavigation = filteredNavigation.filter((item) => allowedNames.includes(item.name));
  }


  const handleLogout = () => {
    console.log("Logging out user:", user);
    logout();

  };

  // Sidebar inner content reused between desktop aside and mobile drawer
  const SidebarInner = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="hidden lg:flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
        {sidebarOpen && (
          <div className="flex items-center space-x-2">
            {/* <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
            <span className="text-xl font-bold text-sidebar-foreground">Aspire</span> */}
            <img src="/aspire-logo.png" alt="Aspire Logo" className="h-auto w-full rounded-lg" />
          </div>
        )}
        <div className="flex items-center space-x-2">
          {/* Theme toggle - hidden when sidebar is collapsed (desktop only) */}
          {sidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          )}

          {/* Desktop collapse button */}
          <div className="hidden lg:block">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile close button will be rendered in mobile drawer header */}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4">
        {filteredNavigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          return (
            <Link key={item.name} to={item.href} onClick={() => setMobileOpen(false)}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", sidebarOpen && "mr-3")} />
                {sidebarOpen && <span>{item.name}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4 sticky bottom-0 bg-sidebar flex-shrink-0">
        <div className={cn("flex items-center", sidebarOpen ? "justify-between" : "justify-center")}>
          {sidebarOpen && (
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-full bg-gradient-primary" />
              <div>
                <p className="text-sm font-medium text-sidebar-foreground">{user?.full_name}</p>
                <p className="text-xs text-sidebar-foreground/70">
                  {userRole === "super_admin" ? "Super Admin" : "Org Admin"}
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar (collapsible) */}
      <aside
        className={cn(
          "bg-sidebar border-r border-sidebar-border transition-all duration-300 hidden lg:block",
          sidebarOpen ? "w-64" : "w-20"
        )}
      >
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      <div className={cn("lg:hidden fixed inset-0 z-40", mobileOpen ? "" : "pointer-events-none")}>
        {/* overlay */}
        <div
          className={cn(
            "fixed inset-0 bg-black/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          aria-hidden={!mobileOpen}
          onClick={() => setMobileOpen(false)}
        />

        {/* drawer */}
        <div
          ref={mobileRef}
          className={cn(
            "fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border transform transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
        >
          {/* Mobile header: show logo and close button */}
          <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
            <div className="flex items-center space-x-2">
              {/* <div className="h-8 w-8 rounded-lg bg-gradient-primary" />
              <span className="text-xl font-bold text-sidebar-foreground">Aspire</span> */}
              <img src="/aspire-logo.png" alt="Aspire Logo" className="h-auto w-3/4 rounded-lg" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              aria-label="Close menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {SidebarInner}
        </div>
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto relative z-0">
        {/* Mobile topbar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="text-foreground"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-foreground"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-foreground"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="p-3 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
