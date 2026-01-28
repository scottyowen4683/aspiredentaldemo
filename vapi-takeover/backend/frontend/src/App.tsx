import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";

// Import Context
import { UserProvider } from "./context/UserContext";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Conversations from "./pages/Conversations";
import ConversationDetails from "./pages/ConversationDetails";
import Assistants from "./pages/Assistants";
import ReviewQueue from "./pages/ReviewQueue";
import Organizations from "./pages/Organizations";
import Analytics from "./pages/Analytics";
import Invites from "./pages/Invites";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import OrganizationDashboard from "./pages/OrganizationDashboard";
import SuperAdminOrganizationDashboard from "./pages/SuperAdminOrganizationDashboard";
import OrgDashboard from "./pages/OrgDashboard";
import { useUser } from "./context/UserContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import EnrollMFA from "./components/MFA/EnrollMFA";
import AuthMFA from "./components/MFA/AuthMFA";
import Campaigns from "./pages/Campaigns";
import KnowledgeBase from "./pages/KnowledgeBase";
import Settings from "./pages/Settings";
import Billing from "./pages/Billing";
import Pilot from "./pages/Pilot";
import Index from "./pages/Index";

// Marketing Pages (from premium-redesign)
import MarketingLayout from "./pages/marketing/MarketingLayout";
import MarketingHome from "./pages/marketing/Home";
import MarketingBusiness from "./pages/marketing/Business";
import MarketingGovernment from "./pages/marketing/Government";
import MarketingFramework from "./pages/marketing/Framework";
import MarketingAgents from "./pages/marketing/Agents";
import MarketingAgentsVoice from "./pages/marketing/AgentsVoice";
import MarketingAgentsChat from "./pages/marketing/AgentsChat";
import MarketingAgentsOutbound from "./pages/marketing/AgentsOutbound";

// Debug flag - set to true to use minimal app for testing
const DEBUG_MINIMAL_APP = false;

const queryClient = new QueryClient();

// Loading spinner component
const LoadingSpinner = () => (
  <div className="w-full h-screen flex items-center justify-center">
    <div className="w-32 h-32 relative flex items-center justify-center">
      <div className="absolute inset-0 rounded-xl bg-blue-500/20 blur-xl animate-pulse"></div>
      <div className="w-full h-full relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-spin blur-sm"></div>
        <div className="absolute inset-1 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden">
          <div className="flex gap-1 items-center">
            <div className="w-1.5 h-12 bg-cyan-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]"></div>
            <div className="w-1.5 h-12 bg-blue-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.1s]"></div>
            <div className="w-1.5 h-12 bg-indigo-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.2s]"></div>
            <div className="w-1.5 h-12 bg-purple-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.3s]"></div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-500/10 to-transparent animate-pulse"></div>
        </div>
      </div>
      <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
      <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-ping delay-100"></div>
      <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-500 rounded-full animate-ping delay-200"></div>
      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping delay-300"></div>
    </div>
  </div>
);

// Component that redirects /dashboard to the correct role-specific dashboard
// IMPORTANT: This must be defined OUTSIDE of App to prevent hook issues
const RoleRedirect = () => {
  const { user, loading } = useUser();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role === "super_admin") return <Navigate to="/superadmin-dashboard" replace />;
  if (user.role === "org_admin") return <Navigate to="/organization-dashboard" replace />;
  // fallback to generic dashboard if role is unexpected
  return <Navigate to="/auth" replace />;
};

const App = () => {
  useEffect(() => {
    // Convert Supabase's #access_token=... into normal query params
    if (window.location.hash && window.location.hash.includes("access_token")) {
      const newUrl = window.location.href.replace("#", "?");
      window.history.replaceState(null, "", newUrl);
      window.location.reload();
    }

  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {/* 👇 Wrap all routes inside UserProvider */}
          <UserProvider>
            <Routes>
              {/* Marketing Site Routes (Public Landing Pages) */}
              <Route element={<MarketingLayout />}>
                <Route path="/" element={<MarketingHome />} />
                <Route path="/business" element={<MarketingBusiness />} />
                <Route path="/government" element={<MarketingGovernment />} />
                <Route path="/framework" element={<MarketingFramework />} />
                <Route path="/agents" element={<MarketingAgents />} />
                <Route path="/agents/voice" element={<MarketingAgentsVoice />} />
                <Route path="/agents/chat" element={<MarketingAgentsChat />} />
                <Route path="/agents/outbound" element={<MarketingAgentsOutbound />} />
              </Route>

              {/* Portal Routes */}
              <Route path="/portal" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* MFA Routes */}
              <Route path="/emf" element={<EnrollMFA />} />


              {/* AFA Routes */}
              <Route path="/vmf" element={<AuthMFA />} />

              {/* Public Pilot Pages */}
              <Route path="/pilot/:slug" element={<Pilot />} />

              {/* Protected routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <RoleRedirect />
                  </ProtectedRoute>
                }
              />

              {/* role-specific dashboards */}
              <Route
                path="/superadmin-dashboard"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Organization Dashboard - Client-facing for org_admin */}
              <Route
                path="/organization-dashboard"
                element={
                  <ProtectedRoute allowedRoles={["org_admin"]}>
                    <OrganizationDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Super Admin Organization Dashboard - Internal costs and metrics */}
              <Route
                path="/admin/organization/:orgId"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <SuperAdminOrganizationDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Legacy routes - keep for backwards compatibility */}
              <Route
                path="/organization-dashboard/:orgId"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <OrganizationDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/org-dashboard/:orgId"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <OrgDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizations"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <Organizations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <Conversations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/conversations/:id"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <ConversationDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assistants"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <Assistants />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/review-queue"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <ReviewQueue />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <Analytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/invites"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <Invites />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AuditLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <Campaigns />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/knowledge-base"
                element={
                  <ProtectedRoute allowedRoles={["super_admin", "org_admin"]}>
                    <KnowledgeBase />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/billing"
                element={
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <Billing />
                  </ProtectedRoute>
                }
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </UserProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

// Minimal app for debugging
const MinimalApp = () => {
  return (
    <div style={{
      padding: '40px',
      backgroundColor: '#0f172a',
      minHeight: '100vh',
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ marginBottom: '20px' }}>Debug Mode: App is Loading</h1>
      <p>If you see this, the basic React rendering is working.</p>
      <p style={{ marginTop: '20px' }}>
        <a href="/auth" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
          Go to Auth Page (with full app)
        </a>
      </p>
    </div>
  );
};

export default DEBUG_MINIMAL_APP ? MinimalApp : App;
