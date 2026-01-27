import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Settings, Users, AlertCircle, Bot, ArrowRightCircle, FileText, Building2, UserCog, Mail, DollarSign, Flag, Send, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import EditOrganizationModal from "@/components/dashboard/EditOrganizationModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddOrganizationModal } from "@/components/dashboard/AddOrganizationModal";
import OrganizationRubricModal from "@/components/dashboard/OrganizationRubricModal";
import { SendMonthlyReportModal } from "@/components/dashboard/SendMonthlyReportModal";
import { getAllOrganizations, getOrganizationStats, Organization, deleteOrganization } from "@/services/organizationService";
import { updateOrganizationRubric } from "@/services/rubricService";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function Organizations() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [orgToEdit, setOrgToEdit] = useState<Organization | null>(null);
  const [isRubricModalOpen, setIsRubricModalOpen] = useState(false);
  const [orgForRubric, setOrgForRubric] = useState<Organization | null>(null);
  const orgForRubricRef = useRef<Organization | null>(null);
  const [isSendReportModalOpen, setIsSendReportModalOpen] = useState(false);
  const [orgForReport, setOrgForReport] = useState<Organization | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch organizations data
  const {
    data: organizationsResult,
    isLoading: isLoadingOrganizations,
    error: organizationsError,
    refetch: refetchOrganizations
  } = useQuery({
    queryKey: ['organizations', 'with-service-plan'], // Updated key to bypass cache
    queryFn: getAllOrganizations,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always refetch to get latest data including service plan fields
  });

  // Fetch stats data
  const {
    data: statsResult,
    isLoading: isLoadingStats,
  } = useQuery({
    queryKey: ['organization-stats'],
    queryFn: getOrganizationStats,
    refetchOnWindowFocus: false,
  });

  const { user } = useUser();

  let organizations: Organization[] = organizationsResult?.data || [];

  // If the logged-in user is an org_admin, restrict the list to their assigned org(s)
  // Assumption: users table has `org_id` that links the user to a single organization.
  if (user && (user.role === "org_admin" || user.role === "member")) {
    if (user.org_id) {
      organizations = organizations.filter((org: Organization) => org.id === user.org_id);
    } else {
      // If no org_id present, show empty list — user isn't assigned to any org
      organizations = [];
    }
  }
  const totalStats = statsResult?.data || {
    organizations: 0,
    totalUsers: 0,
    totalAssistants: 0,
    totalConversations: 0,
  };

  // Show total organizations differently for org_admin: only their assigned org(s)
  const displayOrgCount = user?.role === "super_admin"
    ? (totalStats.organizations ?? organizations.length)
    : organizations.length;

  // Filter organizations based on search query
  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle organization creation success
  const handleOrganizationCreated = () => {
    refetchOrganizations();
    toast({
      title: "Success",
      description: "Organization created successfully!",
    });
  };

  // Normalize role for DashboardLayout prop: default to org_admin for non-super users
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name ?? "User"}>
  <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Organizations
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Manage client organizations and their resources
            </p>
          </div>
          {/* Only super admins can create organizations */}
          {user?.role === "super_admin" && (
            <Button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Add Organization
            </Button>
          )}
        </div>



        {/* Summary Stats */}
        <div className="grid gap-4 sm:gap-6 grid-cols-2 md:grid-cols-4">
          <Card className="shadow-card bg-gradient-card">
                <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Organizations
              </CardTitle>
            </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-3xl font-bold text-foreground">{displayOrgCount}</div>
                )}
              </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{totalStats.totalUsers}</div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Assistants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{totalStats.totalAssistants}</div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Conversations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{totalStats.totalConversations}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search organizations..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Organizations Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>All Organizations</CardTitle>
            <CardDescription>
              View and manage all client organizations
              {searchQuery && ` - Showing results for "${searchQuery}"`}
            </CardDescription>
          </CardHeader>
    <CardContent className="p-0">
            {isLoadingOrganizations ? (
              <div className="p-4 space-y-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Assistants</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Conversations</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : organizationsError ? (
              <div className="flex items-center justify-center p-8 text-destructive">
                <AlertCircle className="h-8 w-8 mr-2" />
                <span>Error loading organizations: {organizationsError.message}</span>
              </div>
            ) : filteredOrganizations.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                {searchQuery ? (
                  <span>No organizations found matching "{searchQuery}"</span>
                ) : (
                  <span>No organizations found. Create your first organization to get started.</span>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Assistants</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Conversations</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrganizations.map((org) => (
                    <TableRow key={org.id} className="hover:bg-gradient-card">
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Bot className="h-4 w-4 mr-2 text-muted-foreground" />
                          {org.assistantCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                          {org.userCount || 0}
                        </div>
                      </TableCell>
                      <TableCell>{(org.conversationCount || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant={org.active !== false ? "default" : "secondary"}
                          className={org.active !== false ? "bg-success" : ""}
                        >
                          {org.active !== false ? 'active' : 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(org.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" aria-label="Organization actions">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/organization-dashboard/${org.id}`)}>
                              <ArrowRightCircle className="mr-2 h-4 w-4" />
                              View Organization Dashboard
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { 
                              setOrgToEdit(org); 
                              setIsEditModalOpen(true); 
                            }}>
                              <Building2 className="mr-2 h-4 w-4" />
                              Manage Org
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { 
                              setOrgForRubric(org);
                              orgForRubricRef.current = org;
                              setIsRubricModalOpen(true);
                            }}>
                              <FileText className="mr-2 h-4 w-4" />
                              Manage Rubric
                            </DropdownMenuItem>
                            {user?.role === "super_admin" && (
                              <DropdownMenuItem onClick={() => {
                                setOrgForReport(org);
                                setIsSendReportModalOpen(true);
                              }}>
                                <Send className="mr-2 h-4 w-4" />
                                Send Monthly Report
                              </DropdownMenuItem>
                            )}
                            {user?.role === "super_admin" && (
                              <DropdownMenuItem onClick={() => navigate(`/review-queue?orgId=${org.id}`)}>
                                <Flag className="mr-2 h-4 w-4" />
                                Review Queue
                              </DropdownMenuItem>
                            )}
                            {user?.role === "super_admin" && (
                              <>
                                <DropdownMenuItem onClick={() => navigate(`/users?orgId=${org.id}`)}>
                                  <UserCog className="mr-2 h-4 w-4" />
                                  Manage Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/invites?orgId=${org.id}`)}>
                                  <Mail className="mr-2 h-4 w-4" />
                                  Manage Invites
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/assistants?orgId=${org.id}`)}>
                                  <Bot className="mr-2 h-4 w-4" />
                                  Manage Assistant
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Manage Usage and Cost
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={async () => {
                                    if (!confirm(`Delete "${org.name}"? This will permanently delete all assistants, users, conversations, and data associated with this organization. This cannot be undone.`)) return;
                                    try {
                                      const res = await deleteOrganization(org.id);
                                      if (res.success) {
                                        refetchOrganizations();
                                        toast({ title: "Deleted", description: `Organization "${org.name}" has been deleted` });
                                      } else {
                                        console.error("Delete organization error:", res.error);
                                        toast({ title: "Error", description: res.error || "Failed to delete organization", variant: "destructive" });
                                      }
                                    } catch (e: any) {
                                      console.error("Delete organization exception:", e);
                                      toast({ title: "Error", description: e?.message || "Failed to delete organization", variant: "destructive" });
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Organization
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Organization Modal */}
      <AddOrganizationModal
        open={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        onSuccess={handleOrganizationCreated}
      />

      {/* Edit Organization Modal (UI-only) */}
      <EditOrganizationModal
        open={isEditModalOpen}
        onOpenChange={(open) => {
          if (!open) setOrgToEdit(null);
          setIsEditModalOpen(open);
        }}
        organization={orgToEdit}
        onSave={(updated) => {
          // After successful update, refresh list and show toast
          refetchOrganizations();
          toast({ title: "Updated", description: `Organization "${updated.name}" updated successfully` });
        }}
      />

      {/* Organization Rubric Modal */}
      <OrganizationRubricModal
        open={isRubricModalOpen}
        onOpenChange={(open) => {
          setIsRubricModalOpen(open);
          
          // Only reset when truly closing
          if (!open) {
            setOrgForRubric(null);
            orgForRubricRef.current = null;
          }
        }}
        organization={(() => {
          const orgData = orgForRubric || orgForRubricRef.current;




          
          if (!orgData) return null;
          


          
          let parsedRubric = null;

          // Rubric is stored in settings.default_rubric (JSONB field)
          const rubricFromSettings = orgData.settings?.default_rubric;

          if (rubricFromSettings) {
            // If it's already an object, use it directly
            if (typeof rubricFromSettings === 'object') {
              parsedRubric = rubricFromSettings;
            }
            // If it's a string, parse it
            else if (typeof rubricFromSettings === 'string') {
              try {
                parsedRubric = JSON.parse(rubricFromSettings);
              } catch (error) {
                console.error("Error parsing rubric JSON:", error);
                parsedRubric = null;
              }
            }
          }
          
          const result = {
            id: orgData.id,
            name: orgData.name,
            default_rubric: parsedRubric
          };
          

          return result;
        })()}
        onSave={async (rubric) => {
          const orgData = orgForRubric || orgForRubricRef.current;
          if (!orgData) return;
          
          try {
            const result = await updateOrganizationRubric(orgData.id, rubric, user?.id);
            
            if (result.success) {
              // After successful save, refresh list and show toast
              refetchOrganizations();
              toast({ 
                title: "Rubric Saved", 
                description: `Default rubric updated for ${orgData.name}` 
              });
            } else {
              throw new Error(result.error?.message || "Failed to save rubric");
            }
          } catch (error) {
            console.error("Error saving organization rubric:", error);
            toast({
              title: "Error",
              description: "Failed to save rubric. Please try again.",
              variant: "destructive"
            });
          }
        }}
      />

      {/* Send Monthly Report Modal */}
      <SendMonthlyReportModal
        open={isSendReportModalOpen}
        onOpenChange={(open) => {
          setIsSendReportModalOpen(open);
          if (!open) {
            setOrgForReport(null);
          }
        }}
        organizationId={orgForReport?.id || ""}
        organizationName={orgForReport?.name || ""}
      />
    </DashboardLayout>
  );
}
