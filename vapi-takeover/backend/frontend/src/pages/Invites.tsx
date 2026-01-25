import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useUser } from "@/context/UserContext";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { fetchOrganizations } from "@/services/organizationService";
import { supabase } from "@/supabaseClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createOrganizationAndInvite, inviteUserToOrganization } from "@/services/organizationInvitations";
import { useToast } from "@/hooks/use-toast";
import { Plus, Mail } from "lucide-react";

type Invite = {
  idx: number;
  id: string;
  email: string;
  org_id: string;
  role: string;
  token: string;
  accepted: boolean;
  created_at: string;
  expires_at: string;
};


export default function Invites() {
  const { user } = useUser();
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";
  const { toast } = useToast();

  //   const [invites] = useState<Invite[]>(MOCK_INVITES);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "accepted" | "pending">("all");
  const [emailQuery, setEmailQuery] = useState<string>("");
  const [orgQuery, setOrgQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [orgMap, setOrgMap] = useState<Record<string, string>>({});
  
  // Add New Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [organizations, setOrganizations] = useState<Array<{id: string, name: string}>>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        // fetch organizations
        const orgs = await fetchOrganizations();
        
        // build org map
        const map: Record<string, string> = {};
        orgs.forEach((o) => {
          map[o.id] = o.name ?? o.id;
        });
        setOrgMap(map);
        setOrganizations(orgs.map(o => ({ id: o.id, name: o.name ?? o.id })));

        // Fetch invites based on user role
        let invitesQuery = supabase.from("invites").select("*").order("created_at", { ascending: false });
        
        console.log("Fetching invites - Role:", currentRole, "Org ID:", user?.org_id);
        
        // For org_admin, only show invites for their organization
        if (currentRole === "org_admin" && user?.org_id) {
          invitesQuery = invitesQuery.eq("org_id", user.org_id);
          console.log("Filtering invites for org_admin, org_id:", user.org_id);
        } else {
          console.log("Fetching all invites (super_admin)");
        }
        
        const { data: inviteData, error: inviteError } = await invitesQuery;
        
        console.log("Invites query result:", { 
          count: inviteData?.length, 
          error: inviteError,
          data: inviteData 
        });
        
        // Check if table exists and has any data at all
        const { count, error: countError } = await supabase
          .from("invites")
          .select("*", { count: 'exact', head: true });
        console.log("Total invites in database:", count, "Error:", countError);

        if (!mounted) return;

        if (inviteError) {
          console.error("Error fetching invites:", inviteError);
          setInvites([]);
        } else {
          setInvites((inviteData as Invite[]) || []);
        }
      } catch (err) {
        console.error("Failed to load invites page data:", err);
        if (!mounted) return;
        setInvites([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [currentRole, user?.org_id]);

  // If route includes ?orgId=..., pre-fill orgQuery with the org name (or id) after orgMap loads
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orgIdParam = params.get("orgId");
    if (!orgIdParam) return;
    
    // Pre-select organization for invite modal
    setSelectedOrgId(orgIdParam);
    
    // Only set if user hasn't already typed a query
    if (orgQuery) return;
    // If orgMap already has the name, use it; otherwise fallback to id
    if (orgMap && Object.keys(orgMap).length > 0) {
      setOrgQuery(orgMap[orgIdParam] ?? orgIdParam);
    }
    // If orgMap not yet loaded, wait for it in another effect (this effect will re-run when orgMap changes)
  }, [location.search, orgMap, orgQuery]);

  const filtered = useMemo(() => {
    return invites.filter((inv) => {
      if (statusFilter === "accepted" && !inv.accepted) return false;
      if (statusFilter === "pending" && inv.accepted) return false;
      if (emailQuery && !inv.email.toLowerCase().includes(emailQuery.toLowerCase())) return false;
      if (orgQuery) {
        const orgName = (orgMap[inv.org_id] ?? inv.org_id).toLowerCase();
        const q = orgQuery.toLowerCase();
        if (!orgName.includes(q) && !inv.org_id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invites, statusFilter, emailQuery, orgMap, orgQuery]);

  // Group invites by email so common entries show once and we can show invite count
  const grouped = useMemo(() => {
    const map: Record<string, Invite[]> = {};
    filtered.forEach((inv) => {
      const key = inv.email.toLowerCase();
      if (!map[key]) map[key] = [];
      map[key].push(inv);
    });

    return Object.values(map).map((group) => {
      const count = group.length;
      const email = group[0].email;
      const role = group[0].role;
      const orgNames = Array.from(new Set(group.map((g) => orgMap[g.org_id] ?? g.org_id)));
      const anyAccepted = group.some((g) => g.accepted);
      const allAccepted = group.every((g) => g.accepted);
      // pick latest expires_at
      const latestExpires = group.reduce((acc, cur) => (new Date(cur.expires_at) > new Date(acc) ? cur.expires_at : acc), group[0].expires_at);
      const ids = group.map((g) => g.id);
      return { email, role, orgNames, count, anyAccepted, allAccepted, latestExpires, ids, raw: group } as const;
    });
  }, [filtered, orgMap]);

  const handleReinvite = async (invite: Invite) => {
    try {
      const result = await inviteUserToOrganization({
        organizationId: invite.org_id,
        userEmail: invite.email
      });

      if (result.success) {
        console.log(`✅ Re-invite sent successfully to ${invite.email}`);
        toast({
          title: "Re-Invite Sent",
          description: `An invite has been re-sent to ${invite.email}.`,
        });
        fetchInvites();
      } else {
        console.error('Failed to re-invite:', result.message);
        toast({
          title: "Re-Invite Failed",
          description: `Failed to re-invite: ${result.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Unexpected error during re-invite:', error);
      toast({
        title: "Unexpected Error",
        description: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    }
  };

  // Handle sending new invite
  const handleSendNewInvite = async () => {
    if (!newInviteEmail) {
      toast({
        title: "Missing Information",
        description: "Please provide an email address.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedOrgId) {
      toast({
        title: "No Organization Selected",
        description: "Please select an organization to send invites.",
        variant: "destructive",
      });
      return;
    }

    setIsInviting(true);
    try {
      const result = await inviteUserToOrganization({
        organizationId: selectedOrgId,
        userEmail: newInviteEmail
      });

      if (result.success) {
        console.log(`✅ Invite sent successfully to ${newInviteEmail}`);
        toast({
          title: "Invite Sent",
          description: `An invitation has been sent to ${newInviteEmail}.`,
        });
        
        // Reset form and close modal
        setNewInviteEmail("");
        setSelectedOrgId("");
        setIsInviteModalOpen(false);
        
        // Refresh invites list
        fetchInvites();
      } else {
        console.error('Failed to send invite:', result.message);
        toast({
          title: "Invite Failed",
          description: `Failed to send invite: ${result.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Unexpected error sending invite:', error);
      toast({
        title: "Unexpected Error",
        description: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setIsInviting(false);
    }
  };

  const fetchInvites = async () => {
    setLoading(true);
    try {
      console.log("fetchInvites called - Role:", currentRole, "Org ID:", user?.org_id);
      
      // Fetch invites based on user role
      let invitesQuery = supabase.from("invites").select("*").order("created_at", { ascending: false });
      
      // For org_admin, only show invites for their organization
      if (currentRole === "org_admin" && user?.org_id) {
        invitesQuery = invitesQuery.eq("org_id", user.org_id);
        console.log("Filtering invites for org_admin, org_id:", user.org_id);
      } else {
        console.log("Fetching all invites (super_admin)");
      }
      
      const { data: inviteData, error: inviteError } = await invitesQuery;
      
      console.log("fetchInvites result:", { 
        count: inviteData?.length, 
        error: inviteError,
        data: inviteData 
      });
      
      if (inviteError) {
        console.error("Error fetching invites:", inviteError);
        setInvites([]);
      } else {
        setInvites(inviteData || []);
      }
    } catch (err) {
      console.error("Failed to fetch invites:", err);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);



  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "User"}>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">Invites</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 md:mt-2">Manage organization invites</p>
          </div>

          <div className="flex gap-2 sm:flex-row sm:items-center">
            {currentRole === "super_admin" && (
              <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
                <DialogTrigger asChild>
                  <Button className="flex items-center justify-center gap-2 w-full sm:w-auto">
                    <Plus className="h-4 w-4" />
                    <span>Add New Invite</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[95vw] sm:w-full">
                  <DialogHeader>
                    <DialogTitle className="text-base sm:text-lg">Send New Invitation</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="organization" className="text-xs sm:text-sm">Organization</Label>
                      <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                        <SelectTrigger id="organization" className="w-full text-sm">
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
                    <div>
                      <Label htmlFor="email" className="text-xs sm:text-sm">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="user@example.com"
                        value={newInviteEmail}
                        onChange={(e) => setNewInviteEmail(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setIsInviteModalOpen(false)} className="w-full sm:w-auto">
                        Cancel
                      </Button>
                      <Button onClick={handleSendNewInvite} disabled={isInviting} className="w-full sm:w-auto">
                        {isInviting ? (
                          <>
                            <Mail className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Send Invite
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            <Input 
              placeholder="Search by email" 
              value={emailQuery} 
              onChange={(e) => setEmailQuery(e.target.value)} 
              className="w-full text-sm"
            />
            <Input 
              placeholder="Search by org" 
              value={orgQuery} 
              onChange={(e) => setOrgQuery(e.target.value)} 
              className="w-full text-sm"
            />

            <Select onValueChange={(v: string) => setStatusFilter(v as 'all' | 'accepted' | 'pending')}>
              <SelectTrigger className="w-full sm:w-[140px] text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-6">
            {loading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:-mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Email</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden md:table-cell">Role</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden lg:table-cell">Orgs</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center hidden sm:table-cell">Count</TableHead>
                      <TableHead className="text-xs sm:text-sm">Status</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden xl:table-cell">Expires</TableHead>
                      <TableHead className="text-xs sm:text-sm">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped.map((g) => (
                      <TableRow key={g.email}>
                        <TableCell className="text-xs sm:text-sm">
                          <div className="max-w-[150px] sm:max-w-[200px] truncate">{g.email}</div>
                          <div className="md:hidden text-[10px] text-muted-foreground capitalize">{g.role}</div>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm capitalize hidden md:table-cell">{g.role}</TableCell>
                        <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                          <div className="truncate max-w-[150px] xl:max-w-[200px]">{g.orgNames.join(", ")}</div>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-center font-medium hidden sm:table-cell">{g.count}</TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          <Badge variant={g.anyAccepted ? "default" : "outline"} className="text-[10px] sm:text-xs">
                            {g.anyAccepted ? "Accepted" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm hidden xl:table-cell whitespace-nowrap">
                          {new Date(g.latestExpires).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReinvite(g.raw[0])}
                            disabled={g.allAccepted}
                            title={g.allAccepted ? "All invites accepted" : "Re-send invite(s)"}
                            className="text-xs h-7 sm:h-8 px-2 sm:px-3"
                          >
                            Re-Invite
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
