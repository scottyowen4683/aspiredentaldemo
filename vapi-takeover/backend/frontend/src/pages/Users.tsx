// src/pages/dashboard/Users.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, AlertCircle, User, Settings, Edit, Trash, Lock, Key, UserPlus, Building2, Shield, RefreshCw, Mail, Filter } from "lucide-react";
import { supabase } from "@/supabaseClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams } from "react-router-dom";
import { getAllUsers, getUserStats, updateUser, deleteUser } from "@/services/userService";
import { useUser } from "@/context/UserContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Organization {
  id: string;
  name: string;
}

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<"org_admin">("org_admin");
  const [inviteOrgId, setInviteOrgId] = useState<string>("");
  const { toast } = useToast();




  // Fetch users
  const {
    data: usersResult,
    isLoading: isLoadingUsers,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["users"],
    queryFn: getAllUsers,
    refetchOnWindowFocus: false,
  });

  // Fetch stats
  const {
    data: statsResult,
    isLoading: isLoadingStats,
  } = useQuery({
    queryKey: ["user-stats"],
    queryFn: getUserStats,
    refetchOnWindowFocus: false,
  });

  // Fetch organizations for filter dropdown
  const {
    data: organizations = [],
    isLoading: isLoadingOrgs,
  } = useQuery({
    queryKey: ["organizations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data || []) as Organization[];
    },
    enabled: user?.role === "super_admin",
    refetchOnWindowFocus: false,
  });

  const users = usersResult?.data || [];
  const stats = statsResult?.data || {
    totalUsers: 0,
    totalAdmins: 0,
    totalSuperAdmins: 0,
  };

  const [searchParams] = useSearchParams();
  const orgFilter = searchParams.get("orgId");
  const { user } = useUser();

  let filteredUsers = users;

  // Apply URL org filter if present
  if (orgFilter) {
    filteredUsers = filteredUsers.filter((u) => u.org_id === orgFilter);
  }

  // Apply dropdown org filter for super_admin
  if (user?.role === "super_admin" && selectedOrgFilter !== "all") {
    filteredUsers = filteredUsers.filter((u) => u.org_id === selectedOrgFilter);
  }

  // For org_admin, only show users from their organization
  if (user?.role === "org_admin" && user?.org_id) {
    filteredUsers = filteredUsers.filter((u) => u.org_id === user.org_id);
  }

  // Hide super_admin users from org_admins
  if (user?.role === "org_admin") {
    filteredUsers = filteredUsers.filter((u) => u.role !== "super_admin");
  }

  filteredUsers = filteredUsers.filter((u) =>
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate org-specific stats
  const orgFilteredStats = {
    totalUsers: filteredUsers.length,
    totalAdmins: filteredUsers.filter(u => u.role === "org_admin").length,
    totalSuperAdmins: filteredUsers.filter(u => u.role === "super_admin").length,
  };
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<null | (typeof users)[0]>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    // Normalize role for DashboardLayout prop: default to org_admin for non-super users
    const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  // Handle invite user
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteOrgId) {
      toast({ title: "Error", description: "Email and organization are required", variant: "destructive" });
      return;
    }

    setIsSubmittingInvite(true);
    try {
      // Create invite in database
      const { data: inviteData, error: inviteError } = await supabase
        .from("user_invites")
        .insert({
          email: inviteEmail,
          full_name: inviteFullName || null,
          role: inviteRole,
          org_id: inviteOrgId,
          invited_by: user?.id,
          status: "pending",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (inviteError) {
        // Check if it's a duplicate
        if (inviteError.code === "23505") {
          toast({ title: "Error", description: "An invite already exists for this email", variant: "destructive" });
        } else {
          throw inviteError;
        }
        return;
      }

      // Send invite email via Supabase auth
      const redirectTo = `${window.location.origin}/auth?invite=${inviteData.id}`;
      const { error: authError } = await supabase.auth.admin.inviteUserByEmail(inviteEmail, {
        redirectTo,
        data: {
          full_name: inviteFullName,
          role: inviteRole,
          org_id: inviteOrgId,
        },
      });

      // If auth invite fails, just log it - the user can still sign up
      if (authError) {
        console.warn("Auth invite failed, but database invite created:", authError);
      }

      toast({
        title: "Invite Sent",
        description: `Invitation sent to ${inviteEmail}`,
      });

      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteOrgId("");
      refetchUsers();
    } catch (error) {
      console.error("Error inviting user:", error);
      toast({
        title: "Error",
        description: "Failed to send invitation. The user may already exist.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              User Management
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              {user?.role === "super_admin"
                ? "Manage all platform users and their access"
                : "Manage users in your organization"}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetchUsers()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => {
              setInviteOrgId(user?.role === "org_admin" ? user.org_id || "" : "");
              setIsInviteOpen(true);
            }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-4">
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {selectedOrgFilter !== "all" || user?.role === "org_admin"
                    ? orgFilteredStats.totalUsers
                    : stats.totalUsers}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Org Admins
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {selectedOrgFilter !== "all" || user?.role === "org_admin"
                    ? orgFilteredStats.totalAdmins
                    : stats.totalAdmins}
                </div>
              )}
            </CardContent>
          </Card>
          {user?.role === "super_admin" && (
            <Card className="shadow-card bg-gradient-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Super Admins
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingStats ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <div className="text-3xl font-bold text-foreground">{stats.totalSuperAdmins}</div>
                )}
              </CardContent>
            </Card>
          )}
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingOrgs ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {user?.role === "super_admin" ? organizations.length : 1}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name or email..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {user?.role === "super_admin" && (
                <Select value={selectedOrgFilter} onValueChange={setSelectedOrgFilter}>
                  <SelectTrigger className="w-full md:w-[250px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by organization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>
              View and manage all registered users
              {searchQuery && ` - Showing results for "${searchQuery}"`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingUsers ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading users...</span>
              </div>
            ) : usersError ? (
              <div className="flex items-center justify-center p-8 text-destructive">
                <AlertCircle className="h-8 w-8 mr-2" />
                <span>Error loading users: {usersError.message}</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                {searchQuery ? (
                  <span>No users found matching "{searchQuery}"</span>
                ) : (
                  <span>No users found.</span>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Organization</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-gradient-card">
                      <TableCell className="font-medium flex items-center">
                        <User className="h-4 w-4 mr-2 text-muted-foreground" />
                        {u.email}
                      </TableCell>
                      <TableCell>{u.full_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{u.role}</Badge>
                      </TableCell>
                      <TableCell>{u.organization_name}</TableCell>
                      <TableCell>
                        {u.locked ? (
                          <Badge variant="destructive">locked</Badge>
                        ) : (
                          <Badge
                            variant={u.status === "active" ? "default" : "secondary"}
                            className={u.status === "active" ? "bg-success" : ""}
                          >
                            {u.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent align="end">
                            {user?.role === 'super_admin' ? (
                              <>
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const confirmed = window.confirm(`Send password reset email to ${u.email}?`);
                                    if (!confirmed) return;
                                    try {
                                      const redirectTo = `${window.location.origin}/reset-password`;
                                      const { data, error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo });
                                      if (error) {
                                        toast({ title: 'Error', description: error.message, variant: 'destructive' });
                                      } else {
                                        toast({ title: 'Reset email sent', description: `Password reset link sent to ${u.email}` });
                                      }
                                      // attempt to write audit log
                                      try {
                                        await supabase.from('audit_logs').insert({
                                          org_id: null,
                                          user_id: user?.id ?? null,
                                          action: error ? 'admin_password_reset_failed' : 'admin_password_reset_requested',
                                          details: JSON.stringify({ target_user_id: u.id, target_email: u.email }),
                                          created_at: new Date().toISOString()
                                        });
                                      } catch (auditErr) {
                                        console.error('Audit log failed', auditErr);
                                      }
                                    } catch (err) {
                                      toast({ title: 'Error', description: String(err), variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <Key className="mr-2 h-4 w-4" />
                                  Reset password
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setEditingUser(u); setIsEditOpen(true); }}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                {u.role !== 'super_admin' && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      const action = u.locked ? 'Unsuspend' : 'Suspend';
                                      const confirmed = window.confirm(`${action} user ${u.email}?`);
                                      if (!confirmed) return;
                                      toast({ title: `${action}ing user...`, description: u.email });
                                      try {
                                        const res = await updateUser(u.id, { locked: !u.locked });
                                        if (res.success) {
                                          toast({ title: `${action}ed`, description: `${u.email} ${action === 'Suspend' ? 'suspended' : 'unsuspended'}` });
                                          refetchUsers();
                                        } else {
                                          toast({ title: 'Error', description: res.error || `Failed to ${action.toLowerCase()} user`, variant: 'destructive' });
                                        }
                                      } catch (err) {
                                        toast({ title: 'Error', description: String(err), variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    <Lock className="mr-2 h-4 w-4" />
                                    {u.locked ? 'Unsuspend User' : 'Suspend User'}
                                  </DropdownMenuItem>
                                )}
                                {u.role !== 'super_admin' && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        const confirmed = window.confirm(`Delete user ${u.email}? This will remove them from auth and the users table.`);
                                        if (!confirmed) return;
                                        toast({ title: 'Deleting user...', description: u.email });
                                        try {
                                          const res = await deleteUser(u.auth_id, u.id);
                                          if (res.success) {
                                            toast({ title: 'Deleted', description: `${u.email} removed` });
                                            refetchUsers();
                                          } else {
                                            toast({ title: 'Error', description: res.error || 'Failed to delete user', variant: 'destructive' });
                                          }
                                        } catch (err) {
                                          toast({ title: 'Error', description: String(err), variant: 'destructive' });
                                        }
                                      }}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <Trash className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            ) : (
                              <DropdownMenuItem disabled>
                                <Edit className="mr-2 h-4 w-4" />
                                View
                              </DropdownMenuItem>
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
        {/* Edit User Dialog */}
        <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) setEditingUser(null); setIsEditOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update user profile information</DialogDescription>
            </DialogHeader>
            {editingUser ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsSubmittingEdit(true);
                try {
                  const updates: Partial<{ full_name: string | null; org_id: string | null }> = { full_name: editingUser.full_name };
                  // Role changes are not allowed through this interface
                  const res = await updateUser(editingUser.id, updates);
                  if (res.success) {
                    toast({ title: 'Updated', description: `${editingUser.email} updated` });
                    refetchUsers();
                    setIsEditOpen(false);
                  } else {
                    toast({ title: 'Error', description: res.error || 'Failed to update', variant: 'destructive' });
                  }
                } catch (err) {
                  toast({ title: 'Error', description: String(err), variant: 'destructive' });
                } finally { setIsSubmittingEdit(false); }
              }} className="space-y-4">
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input id="editEmail" value={editingUser.email} disabled />
                </div>

                <div>
                  <Label htmlFor="editFullName">Full name</Label>
                  <Input id="editFullName" value={editingUser.full_name ?? ''} onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })} />
                </div>

                <div>
                  <Label htmlFor="editRole">Role</Label>
                  <Input id="editRole" value={editingUser.role} disabled />
                </div>

                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => { setIsEditOpen(false); setEditingUser(null); }} disabled={isSubmittingEdit}>Cancel</Button>
                  <Button type="submit" disabled={isSubmittingEdit}>{isSubmittingEdit ? 'Saving...' : 'Save'}</Button>
                </DialogFooter>
              </form>
            ) : (
              <p className="text-muted-foreground">No user selected</p>
            )}
          </DialogContent>
        </Dialog>

        {/* Invite User Dialog */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite New User
              </DialogTitle>
              <DialogDescription>
                Send an invitation to add a new user to the platform
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInviteUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="user@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inviteFullName">Full Name</Label>
                <Input
                  id="inviteFullName"
                  placeholder="John Doe"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                />
              </div>

              {user?.role === "super_admin" && (
                <div className="space-y-2">
                  <Label htmlFor="inviteOrg">Organization *</Label>
                  <Select value={inviteOrgId} onValueChange={setInviteOrgId} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {user?.role === "org_admin" && user?.org_id && (
                <input type="hidden" value={user.org_id} />
              )}

              <div className="space-y-2">
                <Label htmlFor="inviteRole">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "org_admin")} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="org_admin">Organization Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  New users are assigned as Organization Admins by default
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium">What happens next?</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>1. User receives an email invitation</li>
                  <li>2. They click the link to set up their account</li>
                  <li>3. After MFA setup, they can access the platform</li>
                </ul>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  disabled={isSubmittingInvite}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingInvite}>
                  {isSubmittingInvite ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
