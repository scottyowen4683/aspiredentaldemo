import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pause, Play, Trash2, Edit, Filter, Search, Bot, Phone, MessageSquare, Code, FileText, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AddAssistantModal from "@/components/dashboard/AddAssistantModal";
import IntegrationModal from "@/components/dashboard/IntegrationModal";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/context/UserContext";
import { fetchAssistants, fetchAssistantsWithConversationCounts, AssistantRow, deleteAssistant, patchAssistant } from "@/services/assistantService";
import { fetchOrganizations } from "@/services/organizationService";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";

export default function Assistants() {
  const [openAddAssistant, setOpenAddAssistant] = useState(false);
  const [assistants, setAssistants] = useState<{
    id: string;
    name: string;
    org: string;
    status: "active" | "paused";
    autoScore: boolean;
    conversationCount: number;
    totalInteractions: number;
    avgInteractionTime: number;
    assistantType?: string | null;
    phoneNumber?: string | null;
    raw?: AssistantRow | null;
  }[]>([]);
  const [orgMap, setOrgMap] = useState<Record<string, string>>({});
  const [editingAssistant, setEditingAssistant] = useState<AssistantRow | null>(null);
  const [loadingAssistants, setLoadingAssistants] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [assistantForIntegration, setAssistantForIntegration] = useState<{
    id: string;
    name: string;
    type: "voice" | "chat" | "both";
  } | null>(null);
  const { toast } = useToast();

  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const orgIdFromUrl = searchParams.get('orgId');

  // Determine effective orgId: URL param (for super admin) or user's org (for org admin)
  const effectiveOrgId = user?.role === "super_admin" && orgIdFromUrl ? orgIdFromUrl : user?.org_id;

  const loadAssistants = async () => {
    setLoadingAssistants(true);
    try {
      const [rows, orgs] = await Promise.all([fetchAssistantsWithConversationCounts(), fetchOrganizations().catch(() => [])]);

      const map: Record<string, string> = {};
      for (const o of orgs) {
        if (o?.id) map[o.id] = o.name ?? o.id;
      }
      setOrgMap(map);

      // Filter assistants based on effective org ID
      const filtered = effectiveOrgId
        ? rows.filter((r) => r.org_id === effectiveOrgId)
        : rows;

      const mapped = filtered.map((r) => ({
        id: r.id,
        name: r.friendly_name ?? "Unnamed Assistant",
        org: (r.org_id && map[r.org_id]) ? map[r.org_id] : (r.org_id ?? "(no org)"),
        status: (r.active === false ? "paused" : "active") as "active" | "paused",
        autoScore: !!r.auto_score,
        conversationCount: r.conversation_count ?? 0,
        totalInteractions: r.total_interactions ?? 0,
        avgInteractionTime: r.avg_interaction_time ?? 0,
        assistantType: r.bot_type,
        phoneNumber: r.phone_number,
        raw: r,
      }));

      setAssistants(mapped);
    } catch (err: unknown) {
      console.error("Error loading assistants:", err);
      toast({ title: "Error", description: "Failed to load assistants", variant: "destructive" });
    } finally {
      setLoadingAssistants(false);
    }
  };

  useEffect(() => {
    loadAssistants();
  }, [user, orgIdFromUrl]);

  // Normalize role for DashboardLayout prop
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  // Filter and search assistants
  const displayedAssistants = assistants
    .filter((a) => {
      if (filter === "all") return true;
      if (filter === "active") return a.status === "active";
      if (filter === "paused") return a.status === "paused";
      return true;
    })
    .filter((a) => {
      if (!searchQuery) return true;
      return a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
             a.org.toLowerCase().includes(searchQuery.toLowerCase());
    });

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              AI Assistants
              {orgIdFromUrl && orgMap[orgIdFromUrl] && (
                <span className="text-xl md:text-2xl text-muted-foreground"> - {orgMap[orgIdFromUrl]}</span>
              )}
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Create and manage your Aspire AI assistants for voice and chat interactions
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setOpenAddAssistant(true)} className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <Plus className="mr-2 h-4 w-4" />
              Create Assistant
            </Button>
          </div>
          <AddAssistantModal
            open={openAddAssistant}
            onOpenChange={(open) => {
              setOpenAddAssistant(open);
              if (!open) setEditingAssistant(null);
            }}
            initialData={editingAssistant ?? undefined}
            onSuccess={loadAssistants}
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
                <Input
                  placeholder="Search assistants..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  onClick={() => setFilter("all")}
                  className="flex-1 sm:flex-none"
                >
                  All ({assistants.length})
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
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Assistants Grid */}
        {loadingAssistants ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="shadow-card transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-lg" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : displayedAssistants.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Bot className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Assistants Found</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                {searchQuery || filter !== "all"
                  ? "No assistants match your current filters. Try adjusting your search."
                  : "Get started by creating your first AI assistant to handle voice calls or chat conversations."
                }
              </p>
              {!searchQuery && filter === "all" && (
                <Button onClick={() => setOpenAddAssistant(true)} className="bg-gradient-to-r from-blue-600 to-purple-600">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Assistant
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayedAssistants.map((assistant) => (
              <Card key={assistant.id} className="shadow-card hover:shadow-elegant transition-all border-l-4 border-l-transparent hover:border-l-primary">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {assistant.assistantType === 'voice' ? (
                          <Phone className="h-4 w-4 text-blue-500" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-green-500" />
                        )}
                        {assistant.name}
                      </CardTitle>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{assistant.org}</Badge>
                        {assistant.assistantType && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              assistant.assistantType === 'voice'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300'
                            )}
                          >
                            {assistant.assistantType === 'voice' ? 'Voice' : 'Chat'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={assistant.status === "active" ? "default" : "secondary"}
                      className={cn(
                        "text-xs",
                        assistant.status === "active" ? "bg-emerald-500 hover:bg-emerald-600" : ""
                      )}
                    >
                      {assistant.status === "active" ? "Active" : "Paused"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Conversations</p>
                      <p className="text-2xl font-bold text-foreground">{assistant.conversationCount}</p>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/50 dark:to-pink-950/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Total Interactions</p>
                      <p className="text-2xl font-bold text-foreground">{assistant.totalInteractions}</p>
                    </div>
                  </div>

                  {/* Phone number for voice assistants */}
                  {assistant.phoneNumber && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg text-sm">
                      <Phone className="h-4 w-4 text-blue-500" />
                      <span className="text-muted-foreground">{assistant.phoneNumber}</span>
                    </div>
                  )}

                  {/* Knowledge Base Status */}
                  {assistant.raw?.kb_enabled && (
                    <div className="flex items-center justify-between p-2 bg-purple-50 dark:bg-purple-950/30 rounded-lg text-sm">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-500" />
                        <span className="text-purple-700 dark:text-purple-300 font-medium">
                          KB: {assistant.raw?.kb_chunks_count || 0} chunks
                        </span>
                      </div>
                      {assistant.raw?.last_kb_upload_at && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(assistant.raw.last_kb_upload_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto-score toggle */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <Label htmlFor={`auto-score-${assistant.id}`} className="cursor-pointer text-sm">
                      Auto-scoring
                    </Label>
                    <Switch
                      id={`auto-score-${assistant.id}`}
                      checked={assistant.autoScore}
                      onCheckedChange={async (checked: boolean) => {
                        setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, autoScore: checked } : a)));
                        try {
                          const res = await patchAssistant(assistant.id, { auto_score: checked });
                          if (!res.success) throw res.error ?? new Error("Failed to update");
                          toast({ title: "Saved", description: `Auto-scoring ${checked ? "enabled" : "disabled"}` });
                        } catch (err) {
                          setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, autoScore: !checked } : a)));
                          toast({ title: "Error", description: "Failed to update", variant: "destructive" });
                        }
                      }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={async () => {
                        const willPause = assistant.status === "active";
                        setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, status: willPause ? "paused" : "active" } : a)));
                        try {
                          const res = await patchAssistant(assistant.id, { active: !willPause });
                          if (!res.success) throw res.error ?? new Error("Failed to update");
                          toast({ title: willPause ? "Paused" : "Resumed", description: `Assistant ${willPause ? "paused" : "resumed"}` });
                        } catch (err) {
                          setAssistants((prev) => prev.map((a) => (a.id === assistant.id ? { ...a, status: willPause ? "active" : "paused" } : a)));
                          toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
                        }
                      }}
                    >
                      {assistant.status === "active" ? (
                        <><Pause className="mr-1 h-3 w-3" /> Pause</>
                      ) : (
                        <><Play className="mr-1 h-3 w-3" /> Resume</>
                      )}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      onClick={() => {
                        setAssistantForIntegration({
                          id: assistant.id,
                          name: assistant.name,
                          type: (assistant.assistantType as "voice" | "chat") || "chat",
                        });
                        setIsIntegrationModalOpen(true);
                      }}
                      title="Get integration code"
                    >
                      <Code className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingAssistant(assistant.raw ?? null);
                        setOpenAddAssistant(true);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={async () => {
                        if (!confirm("Delete this assistant? This cannot be undone.")) return;
                        try {
                          const res = await deleteAssistant(assistant.id);
                          if (res.success) {
                            setAssistants((prev) => prev.filter((a) => a.id !== assistant.id));
                            toast({ title: "Deleted", description: "Assistant deleted" });
                          } else {
                            toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
                          }
                        } catch (e) {
                          toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Integration Modal */}
      <IntegrationModal
        open={isIntegrationModalOpen}
        onOpenChange={(open) => {
          if (!open) setAssistantForIntegration(null);
          setIsIntegrationModalOpen(open);
        }}
        assistantId={assistantForIntegration?.id || ""}
        assistantName={assistantForIntegration?.name || ""}
        assistantType={assistantForIntegration?.type || "chat"}
      />
    </DashboardLayout>
  );
}
