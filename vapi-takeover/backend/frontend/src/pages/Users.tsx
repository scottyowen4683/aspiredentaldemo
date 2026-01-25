// src/pages/dashboard/Users.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, AlertCircle, User, Settings, Edit, Trash, Lock, Key } from "lucide-react";
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

export default function Users() {
  const [searchQuery, setSearchQuery] = useState("");
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
  if (orgFilter) {
    filteredUsers = filteredUsers.filter((u) => u.org_id === orgFilter);
  }

  // Hide super_admin users from org_admins
  if (user?.role === 'org_admin') {
    filteredUsers = filteredUsers.filter((u) => u.role !== 'super_admin');
  }

  filteredUsers = filteredUsers.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<null | (typeof users)[0]>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    // Normalize role for DashboardLayout prop: default to org_admin for non-super users
    const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Users
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Manage system users and their roles
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{stats.totalUsers}</div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Org Admins
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingStats ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-3xl font-bold text-foreground">{stats.totalAdmins}</div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
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
        </div>

        {/* Search */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
      </div>
    </DashboardLayout>
  );
}
