import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { getOrganizationById } from "@/services/organizationService";
import { useUser } from "@/context/UserContext";

export default function OrgDashboard() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();

  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!orgId) return;
      setLoading(true);
      try {
        const res = await getOrganizationById(orgId);
        if (!mounted) return;
        if (res.success && res.data) {
          setOrgName(res.data.name ?? null);
        } else {
          setError(res.error || "Organization not found");
        }
      } catch (err) {
        setError("Failed to load organization");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [orgId]);

  return (
    <DashboardLayout userRole={user?.role === "super_admin" ? "super_admin" : "org_admin"} userName={user?.full_name ?? user?.email ?? "User"}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">Organization Dashboard</h1>
            <p className="text-muted-foreground mt-2">Overview and usage for the selected organization</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Organization Info</CardTitle>
              <CardDescription>Basic metadata</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : error ? (
                <p className="text-destructive">{error}</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium text-foreground">{orgName ?? "(unknown)"}</p>
                  <p className="text-sm text-muted-foreground">ID</p>
                  <p className="font-mono text-sm text-foreground">{orgId}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Usage Summary</CardTitle>
              <CardDescription>High level usage metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Placeholder: add charts and metrics here.</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
              <CardDescription>Short summary and key alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Placeholder overview content.</p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest conversations and events</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Placeholder recent activity.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
