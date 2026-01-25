import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

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

const queryClient = new QueryClient();



const App = () => {

  // Small component that redirects /dashboard to the correct role-specific dashboard
  const RoleRedirect = () => {
    const { user, loading } = useUser();
    if (loading) return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="w-32 h-32 relative flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-xl bg-blue-500/20 blur-xl animate-pulse"
          ></div>

          <div className="w-full h-full relative flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 animate-spin blur-sm"
            ></div>

            <div
              className="absolute inset-1 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden"
            >
              <div className="flex gap-1 items-center">
                <div
                  className="w-1.5 h-12 bg-cyan-500 rounded-full animate-[bounce_1s_ease-in-out_infinite]"
                ></div>
                <div
                  className="w-1.5 h-12 bg-blue-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.1s]"
                ></div>
                <div
                  className="w-1.5 h-12 bg-indigo-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.2s]"
                ></div>
                <div
                  className="w-1.5 h-12 bg-purple-500 rounded-full animate-[bounce_1s_ease-in-out_infinite_0.3s]"
                ></div>
              </div>

              <div
                className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-500/10 to-transparent animate-pulse"
              ></div>
            </div>
          </div>

          <div
            className="absolute -top-1 -left-1 w-2 h-2 bg-blue-500 rounded-full animate-ping"
          ></div>
          <div
            className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-ping delay-100"
          ></div>
          <div
            className="absolute -bottom-1 -left-1 w-2 h-2 bg-cyan-500 rounded-full animate-ping delay-200"
          ></div>
          <div
            className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping delay-300"
          ></div>
        </div>
      </div>
    );
    if (!user) return <Navigate to="/auth" replace />;
    if (user.role === "super_admin") return <Navigate to="/superadmin-dashboard" replace />;
    if (user.role === "org_admin") return <Navigate to="/organization-dashboard" replace />;
    // fallback to generic dashboard if role is unexpected
    return <Navigate to="/auth" replace />;
  };

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
              <Route path="/" element={<Navigate to="/auth" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* MFA Routes */}
              <Route path="/emf" element={<EnrollMFA />} />


              {/* AFA Routes */}
              <Route path="/vmf" element={<AuthMFA />} />

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

              <Route path="*" element={<NotFound />} />
            </Routes>
          </UserProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
