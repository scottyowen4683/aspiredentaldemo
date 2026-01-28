import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { fetchAssistants, patchAssistant, AssistantRow } from "@/services/assistantService";
import { updateOrganization, Organization } from "@/services/organizationService";
import { getAllUsers, assignOrgAdmin, User } from "@/services/userService";

interface ManageOrganizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization;
  onSuccess?: () => void;
}

export function ManageOrganizationModal({ open, onOpenChange, organization, onSuccess }: ManageOrganizationModalProps) {
  const [form, setForm] = useState({ name: organization.name || "", region: organization.region || "" });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null);

  useEffect(() => {
    // Reset form when organization changes
    setForm({ name: organization.name || "", region: organization.region || "" });
  }, [organization]);

  useEffect(() => {
    const load = async () => {
      setLoadingAssistants(true);
      try {
        const data = await fetchAssistants();
        setAssistants(data || []);

        // mark assistants belonging to this org
        const map: Record<string, boolean> = {};
        (data || []).forEach(a => {
          if (a.org_id === organization.id) map[a.id] = true;
        });
        setSelectedAssistantIds(map);
      } catch (err) {
        console.error("Error loading assistants", err);
        toast({ title: "Error", description: "Failed to load assistants.", variant: "destructive" });
      } finally {
        setLoadingAssistants(false);
      }
    };

    // load assistants and users when modal opens
    const loadUsers = async () => {
      setLoadingUsers(true);
      try {
        const resp = await getAllUsers();
        if (resp.success && resp.data) {
          setUsers(resp.data);

          // Preselect current org admin (user with role org_admin and org_id === organization.id)
          const currentAdmin = resp.data.find(u => u.role === 'org_admin' && u.org_id === organization.id);
          setSelectedAdminUserId(currentAdmin ? currentAdmin.id : null);
        }
      } catch (err) {
        console.error('Error loading users', err);
        toast({ title: 'Error', description: 'Failed to load users.', variant: 'destructive' });
      } finally {
        setLoadingUsers(false);
      }
    };

    if (open) {
      load();
      loadUsers();
    }
  }, [open, organization.id, toast]);

  const handleToggleAssistant = (id: string) => {
    setSelectedAssistantIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Update organization basic fields
      const resp = await updateOrganization(organization.id, {
        name: form.name,
        region: form.region,
      });

      if (!resp.success) {
        toast({ title: "Error", description: resp.error || "Failed to update organization.", variant: "destructive" });
        setIsSaving(false);
        return;
      }

      // Update assistants' org_id based on selection
      // For each assistant currently loaded:
      const promises: Promise<any>[] = [];
      assistants.forEach(a => {
        const shouldBeLinked = !!selectedAssistantIds[a.id];
        const currentlyLinked = a.org_id === organization.id;
        if (shouldBeLinked && !currentlyLinked) {
          promises.push(patchAssistant(a.id, { org_id: organization.id }));
        } else if (!shouldBeLinked && currentlyLinked) {
          promises.push(patchAssistant(a.id, { org_id: null }));
        }
      });

      await Promise.all(promises);

      // Assign selected admin user if changed
      if (selectedAdminUserId) {
        const assignResp = await assignOrgAdmin(organization.id, selectedAdminUserId);
        if (!assignResp.success) {
          toast({ title: 'Error', description: assignResp.error || 'Failed to assign org admin.', variant: 'destructive' });
          setIsSaving(false);
          return;
        }
      }

      toast({ title: "Success", description: "Organization updated.", variant: "default" });
      onSuccess?.();
    } catch (err) {
      console.error("Error saving organization", err);
      toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Manage Organization</DialogTitle>
          <DialogDescription>Update organization details and linked assistants.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input id="orgName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={isSaving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Input id="region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} disabled={isSaving} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminEmail">Admin Email</Label>
            <Input id="adminEmail" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} disabled={isSaving} />
          </div>

          <div>
            <Label>Assistants</Label>
            <div className="mt-2 max-h-56 overflow-auto border rounded-md p-2">
              {loadingAssistants ? (
                <div className="flex items-center gap-2"><Loader2 className="animate-spin"/> Loading assistants...</div>
              ) : assistants.length === 0 ? (
                <div className="text-sm text-muted-foreground">No assistants found.</div>
              ) : (
                assistants.map(a => (
                  <label key={a.id} className="flex items-center justify-between gap-4 p-2 hover:bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={!!selectedAssistantIds[a.id]} onChange={() => handleToggleAssistant(a.id)} />
                      <div>
                        <div className="font-medium">{a.friendly_name || a.id}</div>
                        <div className="text-sm text-muted-foreground">{a.provider || "provider"}</div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{a.org_id === organization.id ? "Linked" : ""}</div>
                  </label>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" className="bg-gradient-primary" disabled={isSaving}>
              {isSaving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</>) : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ManageOrganizationModal;
