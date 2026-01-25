import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pause, Play, Settings, Trash2, Edit, Filter, Search, FileText, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AddAssistantModal from "@/components/dashboard/AddAssistantModal";
import AssistantRubricModal from "@/components/dashboard/AssistantRubricModal";
import { getOrganizationRubric, updateAssistantRubric } from "@/services/rubricService";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/context/UserContext";
import { fetchAssistants, fetchAssistantsWithConversationCounts, AssistantRow, deleteAssistant, patchAssistant } from "@/services/assistantService";
import { fetchOrganizations } from "@/services/organizationService";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { ghlAssistantService } from "@/services/ghlAssistantService";
import { GHLAgentSyncModal } from "@/components/dashboard/GHLAgentSyncModal";

export default function Assistants() {
  const [openAddAssistant, setOpenAddAssistant] = useState(false);
  const [assistants, setAssistants] = useState<{
    id: string;
    name: string;
    provider: string;
    org: string;
    status: "active" | "paused";
    autoScore: boolean;
    pauseAutoScore: boolean;
    lastIngest: string;
    lastScore: string;
    errorCount: number;
    conversationCount: number;
    hasCustomRubric: boolean;
    assistantType?: string | null;
    fromApi?: boolean | null;
    raw?: AssistantRow | null;
  }[]>([]);
  const [orgMap, setOrgMap] = useState<Record<string, string>>({});
  const [editingAssistant, setEditingAssistant] = useState<AssistantRow | null>(null);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "error">("all");
  const [isRubricModalOpen, setIsRubricModalOpen] = useState(false);
  const [assistantForRubric, setAssistantForRubric] = useState<AssistantRow | null>(null);
  const [orgRubricForModal, setOrgRubricForModal] = useState<any>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalConfig, setSyncModalConfig] = useState<{
    orgId: string;
    ghlApiKey: string;
    ghlLocationId?: string;
  } | null>(null);
  const { toast } = useToast();

  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const orgIdFromUrl = searchParams.get('orgId');

  // Determine effective orgId: URL param (for super admin) or user's org (for org admin)
  const effectiveOrgId = user?.role === "super_admin" && orgIdFromUrl ? orgIdFromUrl : user?.org_id;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoadingAssistants(true);
      try {
        const [rows, orgs] = await Promise.all([fetchAssistantsWithConversationCounts(), fetchOrganizations().catch(() => [])]);

        const map: Record<string, string> = {};
        for (const o of orgs) {
          if (o?.id) map[o.id] = o.name ?? o.id;
        }
        if (!mounted) return;
        setOrgMap(map);
        
        // Filter assistants based on effective org ID
        // For org admins: show only their org's assistants
        // For super admins: show all if no orgId param, or specific org if orgId provided
        const filtered = effectiveOrgId 
          ? rows.filter((r) => r.org_id === effectiveOrgId)
          : rows;

        const mapped = filtered.map((r) => ({
          id: r.id,
          name: r.friendly_name ?? "Unnamed Assistant",
          provider: (r.provider ?? "unknown").toString(),
          org: (r.org_id && map[r.org_id]) ? map[r.org_id] : (r.org_id ?? "(no org)"),
          status: (r.pause_ingest ? "paused" : "active") as "active" | "paused",
          autoScore: !!r.auto_score,
          pauseAutoScore: !!r.pause_auto_score,
          lastIngest: r.last_ingest ? new Date(r.last_ingest).toLocaleString() : "Never",
          lastScore: r.last_score ? new Date(r.last_score).toLocaleString() : "Never",
          errorCount: r.error_count ?? 0,
          conversationCount: r.conversation_count ?? 0,
          hasCustomRubric: !!r.rubric,
          assistantType: r.assistant_type,
          fromApi: r.from_api,
          raw: r,
        }));

        setAssistants(mapped);
      } catch (err: unknown) {
        console.error("Error loading assistants:", err);
        toast({ title: "Error", description: "Failed to load assistants", variant: "destructive" });
      } finally {
        if (mounted) setLoadingAssistants(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [toast, user, orgIdFromUrl]);

  // Open GHL sync modal
  const handleSyncGHLAssistants = async () => {
    if (!effectiveOrgId) {
      toast({ title: "Error", description: "Organization not found", variant: "destructive" });
      return;
    }

    try {
      // Get organization GHL API settings
      const orgs = await fetchOrganizations();
      const currentOrg = orgs.find(org => org.id === effectiveOrgId);
      
      if (!currentOrg?.ghl_api_key) {
        toast({ 
          title: "Configuration Required", 
          description: "Please configure GHL API settings in organization settings first",
          variant: "destructive" 
        });
        return;
      }

      // Set config and open modal
      setSyncModalConfig({
        orgId: effectiveOrgId,
        ghlApiKey: currentOrg.ghl_api_key,
        ghlLocationId: currentOrg.ghl_location_id
      });
      setSyncModalOpen(true);
    } catch (error) {
      console.error('Error preparing GHL sync:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to prepare sync",
        variant: "destructive"
      });
    }
  };

  // Refresh assistants list after sync
  const handleSyncComplete = async () => {
    try {
      const [rows, orgs] = await Promise.all([fetchAssistantsWithConversationCounts(), fetchOrganizations().catch(() => [])]);
      const map: Record<string, string> = {};
      for (const o of orgs) {
        if (o?.id) map[o.id] = o.name ?? o.id;
      }
      setOrgMap(map);

      const filtered = user?.role === "org_admin" && user?.org_id
        ? rows.filter((r) => r.org_id === (user.org_id as string))
        : rows;

      const mapped = filtered.map((r) => ({
        id: r.id,
        name: r.friendly_name ?? "Unnamed Assistant",
        provider: (r.provider ?? "unknown").toString(),
        org: (r.org_id && map[r.org_id]) ? map[r.org_id] : (r.org_id ?? "(no org)"),
        status: (r.pause_ingest ? "paused" : "active") as "active" | "paused",
        autoScore: !!r.auto_score,
        pauseAutoScore: !!r.pause_auto_score,
        lastIngest: r.last_ingest ? new Date(r.last_ingest).toLocaleString() : "Never",
        lastScore: r.last_score ? new Date(r.last_score).toLocaleString() : "Never",
        errorCount: r.error_count ?? 0,
        conversationCount: r.conversation_count ?? 0,
        hasCustomRubric: !!r.rubric,
        assistantType: r.assistant_type,
        fromApi: r.from_api,
        raw: r,
      }));
      setAssistants(mapped);
    } catch (error) {
      console.error('Error refreshing assistants:', error);
    }
  };

  // Normalize role for DashboardLayout prop: default to org_admin for non-super users
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Assistants
              {orgIdFromUrl && orgMap[orgIdFromUrl] && (
                <span className="text-xl md:text-2xl text-muted-foreground"> - {orgMap[orgIdFromUrl]}</span>
              )}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Manage your AI assistants and their configurations
              {orgIdFromUrl && orgMap[orgIdFromUrl] && (
                <span> for {orgMap[orgIdFromUrl]}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {effectiveOrgId && (
              <Button
                variant="outline"
                onClick={handleSyncGHLAssistants}
                className="flex-1 sm:flex-none"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Sync GHL Assistants</span>
                <span className="sm:hidden">Sync GHL</span>
              </Button>
            )}
            <Button onClick={() => setOpenAddAssistant(true)} className="flex-1 sm:flex-none">
              <Plus className="mr-2 h-4 w-4" />
              Add Assistant
            </Button>
          </div>
          <AddAssistantModal
            open={openAddAssistant}
            onOpenChange={(open) => {
              setOpenAddAssistant(open);
              if (!open) setEditingAssistant(null);
            }}
            initialData={editingAssistant ?? undefined}
            onSuccess={async () => {
              // refresh list after create/update
              try {
                const [rows, orgs] = await Promise.all([fetchAssistantsWithConversationCounts(), fetchOrganizations().catch(() => [])]);
                const map: Record<string, string> = {};
                for (const o of orgs) {
                  if (o?.id) map[o.id] = o.name ?? o.id;
                }
                setOrgMap(map);

                // If the logged-in user is an org_admin, show only assistants for their org
                const filtered = user?.role === "org_admin" && user?.org_id
                  ? rows.filter((r) => r.org_id === (user.org_id as string))
                  : rows;

                const mapped = filtered.map((r) => ({
                  id: r.id,
                  name: r.friendly_name ?? "Unnamed Assistant",
                  provider: (r.provider ?? "unknown").toString(),
                  org: (r.org_id && map[r.org_id]) ? map[r.org_id] : (r.org_id ?? "(no org)"),
                  status: (r.pause_ingest ? "paused" : "active") as "active" | "paused",
                  autoScore: !!r.auto_score,
                  pauseAutoScore: !!r.pause_auto_score,
                  lastIngest: r.last_ingest ? new Date(r.last_ingest).toLocaleString() : "Never",
                  lastScore: r.last_score ? new Date(r.last_score).toLocaleString() : "Never",
                  errorCount: r.error_count ?? 0,
                  conversationCount: r.conversation_count ?? 0,
                  hasCustomRubric: !!r.rubric,
                  assistantType: r.assistant_type,
                  fromApi: r.from_api,
                  raw: r,
                }));
                setAssistants(mapped);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Filter className="mr-2 h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search conversations..." className="pl-9" />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  onClick={() => setFilter("all")}
                  className={cn(filter === "all" ? "" : "", "flex-1 sm:flex-none")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={filter === "active" ? "default" : "outline"}
                  onClick={() => setFilter("active")}
                  className="flex-1 sm:flex-none"
                >
                  Active
                </Button>
                <Button
                  size="sm"
                  variant={filter === "paused" ? "default" : "outline"}
                  onClick={() => setFilter("paused")}
                  className="flex-1 sm:flex-none"
                >
                  Paused
                </Button>
                <Button
                  size="sm"
                  variant={filter === "error" ? "default" : "outline"}
                  onClick={() => setFilter("error")}
                  className="flex-1 sm:flex-none"
                >
                  Error
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Assistants Grid */}
        {loadingAssistants ? (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="shadow-card transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xl font-semibold leading-none tracking-tight">
                        <Skeleton className="h-6 w-40" />
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center space-x-2">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-24" />
                        </div>
                      </div>
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-card p-3 rounded-lg">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="mt-2 h-8 w-20" />
                    </div>
                    <div className="bg-gradient-card p-3 rounded-lg">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="mt-2 h-8 w-20" />
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {assistants
              .filter((a) => {
                if (filter === "all") return true;
                if (filter === "active") return a.status === "active";
                if (filter === "paused") return a.status === "paused";
                if (filter === "error") return (a.errorCount ?? 0) > 0;
                return true;
              })
              .map((assistant) => (
                <Card key={assistant.id} className="shadow-card hover:shadow-elegant transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{assistant.name}</CardTitle>
                        <div className="mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center space-x-2 flex-wrap gap-1">
                            <Badge variant="outline">{assistant.provider}</Badge>
                            <Badge variant="secondary">{assistant.org}</Badge>
                            {assistant.assistantType && (
                              <Badge 
                                variant="outline" 
                                className={assistant.assistantType === 'voice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}
                              >
                                {assistant.assistantType === 'voice' ? 'Voice AI' : 'Text AI'}
                              </Badge>
                            )}
                            {assistant.fromApi && (
                              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                GHL Synced
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={assistant.status === "active" ? "default" : "secondary"}
                        className={assistant.status === "active" ? "bg-success" : ""}
                      >
                        {assistant.status === "active" ? "Active" : "Paused"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gradient-card p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground">Conversations</p>
                        <p className="text-2xl font-bold text-foreground">{assistant.conversationCount}</p>
                      </div>
                      <div className="bg-gradient-card p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground">Errors</p>
                        <p className="text-2xl font-bold text-foreground">
                          {assistant.errorCount}
                        </p>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        {/* <span className="text-muted-foreground">Last Ingest:</span> */}
                        <span className="font-medium">{assistant.lastIngest}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Score:</span>
                        <span className="font-medium">{assistant.lastScore}</span>
                      </div>
                    </div>

                    {/* Auto-score toggle */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <Label htmlFor={`auto-score-${assistant.id}`} className="cursor-pointer">
                        Auto-score enabled
                      </Label>
                      <Switch
                        id={`auto-score-${assistant.id}`}
                        checked={assistant.autoScore}
                        onCheckedChange={async (checked: boolean) => {
                          // optimistic update
                          setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, autoScore: checked } : a)));
                          try {
                            const res = await patchAssistant(assistant.id, { auto_score: checked });
                            if (!res.success) {
                              throw res.error ?? new Error("Failed to update");
                            }
                            // update raw row with response
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, raw: res.data, autoScore: !!res.data.auto_score } : a)));
                            toast({ title: "Saved", description: `Auto-score ${checked ? "enabled" : "disabled"}` });
                          } catch (err) {
                            console.error(err);
                            // revert
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, autoScore: !checked } : a)));
                            toast({ title: "Error", description: "Failed to update auto-score", variant: "destructive" });
                          }
                        }}
                      />
                    </div>

                    {/* Pause Auto-score toggle */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <Label htmlFor={`pause-auto-score-${assistant.id}`} className="cursor-pointer">
                        Pause auto-scoring
                      </Label>
                      <Switch
                        id={`pause-auto-score-${assistant.id}`}
                        checked={assistant.pauseAutoScore}
                        onCheckedChange={async (checked: boolean) => {
                          // optimistic update
                          setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, pauseAutoScore: checked } : a)));
                          try {
                            const res = await patchAssistant(assistant.id, { pause_auto_score: checked });
                            if (!res.success) {
                              throw res.error ?? new Error("Failed to update");
                            }
                            // update raw row with response
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, raw: res.data, pauseAutoScore: !!res.data.pause_auto_score } : a)));
                            toast({ title: "Saved", description: `Auto-scoring ${checked ? "paused" : "resumed"}` });
                          } catch (err) {
                            console.error(err);
                            // revert
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, pauseAutoScore: !checked } : a)));
                            toast({ title: "Error", description: "Failed to update pause auto-score", variant: "destructive" });
                          }
                        }}
                      />
                    </div>

                    {/* Rubric Status */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm">
                          Scoring Rubric
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={assistant.hasCustomRubric ? "default" : "outline"} className={assistant.hasCustomRubric ? "bg-success" : ""}>
                          {assistant.hasCustomRubric ? "Custom" : "Organization Default"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setAssistantForRubric(assistant.raw ?? null);
                            
                            // Fetch organization rubric for this assistant
                            if (assistant.raw?.org_id) {
                              try {
                                const result = await getOrganizationRubric(assistant.raw.org_id);
                                if (result.success) {
                                  setOrgRubricForModal(result.data);
                                }
                              } catch (error) {
                                console.error("Error fetching organization rubric:", error);
                              }
                            }
                            
                            setIsRubricModalOpen(true);
                          }}
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={async () => {
                          const willPause = assistant.status === "active"; // toggle
                          // optimistic update
                          setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, status: willPause ? "paused" : "active" } : a)));
                          try {
                            const res = await patchAssistant(assistant.id, { pause_ingest: willPause });
                            if (!res.success) throw res.error ?? new Error("Failed to update");
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, raw: res.data, status: res.data.pause_ingest ? "paused" : "active" } : a)));
                            toast({ title: willPause ? "Paused" : "Resumed", description: `Assistant ${willPause ? "paused" : "resumed"}` });
                          } catch (err) {
                            console.error(err);
                            // revert
                            setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, status: willPause ? "active" : "paused" } : a)));
                            toast({ title: "Error", description: "Failed to update assistant status", variant: "destructive" });
                          }
                        }}
                      >
                        {assistant.status === "active" ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Resume
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // open modal in edit mode
                          setEditingAssistant(assistant.raw ?? null);
                          setOpenAddAssistant(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("Delete this assistant? This cannot be undone.")) return;
                          try {
                            const res = await deleteAssistant(assistant.id);
                            if (res.success) {
                              setAssistants((prev) => prev.filter((a) => a.id !== assistant.id));
                              toast({ title: "Deleted", description: "Assistant deleted" });
                            } else {
                              console.error(res.error);
                              toast({ title: "Error", description: "Failed to delete assistant", variant: "destructive" });
                            }
                          } catch (e) {
                            console.error(e);
                            toast({ title: "Error", description: "Failed to delete assistant", variant: "destructive" });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Assistant Rubric Modal */}
      <AssistantRubricModal
        open={isRubricModalOpen}
        onOpenChange={(open) => {
          if (!open) setAssistantForRubric(null);
          setIsRubricModalOpen(open);
        }}
        assistant={assistantForRubric ? {
          id: assistantForRubric.id,
          friendly_name: assistantForRubric.friendly_name,
          org_id: assistantForRubric.org_id,
          rubric: assistantForRubric.rubric ? (() => {
            try {
              return JSON.parse(assistantForRubric.rubric);
            } catch {
              return null;
            }
          })() : null
        } : null}
        organizationRubric={orgRubricForModal}
        onSave={async (rubric, useCustom) => {
          // Update assistant rubric
          if (assistantForRubric) {
            try {
              const result = await updateAssistantRubric(
                assistantForRubric.id,
                useCustom ? rubric : null,
                user?.id
              );
              
              if (result.success) {
                // Update local state
                setAssistants(prev => prev.map(a => 
                  a.id === assistantForRubric.id 
                    ? { ...a, hasCustomRubric: useCustom }
                    : a
                ));
                toast({
                  title: "Rubric Updated",
                  description: useCustom 
                    ? "Custom rubric has been saved" 
                    : "Assistant will use organization default"
                });
              } else {
                throw new Error(result.error?.message || "Failed to update rubric");
              }
            } catch (err) {
              console.error("Error updating rubric:", err);
              toast({
                title: "Error",
                description: "Failed to update rubric. Please try again.",
                variant: "destructive"
              });
            }
          }
        }}
      />

      {/* GHL Agent Sync Modal */}
      {syncModalConfig && (
        <GHLAgentSyncModal
          open={syncModalOpen}
          onOpenChange={setSyncModalOpen}
          orgId={syncModalConfig.orgId}
          ghlApiKey={syncModalConfig.ghlApiKey}
          ghlLocationId={syncModalConfig.ghlLocationId}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </DashboardLayout>
  );
}
