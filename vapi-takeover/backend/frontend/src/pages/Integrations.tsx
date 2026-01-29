import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/supabaseClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plug,
  Plus,
  Settings,
  Database,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Download,
  Upload,
  TestTube,
  History,
  Zap,
  Link2,
  BookOpen,
  Phone,
  FileText,
  Users,
  Building2,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

// Types
interface IntegrationTemplate {
  id: string;
  provider: string;
  display_name: string;
  description: string;
  logo_url?: string;
  default_auth_type: string;
  default_endpoints: Record<string, string>;
  setup_instructions?: string;
  supports_outbound: boolean;
  supports_inbound: boolean;
  supports_kb_import: boolean;
}

interface Integration {
  id: string;
  org_id: string;
  assistant_id?: string;
  name: string;
  provider: string;
  direction: "outbound" | "inbound" | "bidirectional";
  status: "active" | "inactive" | "error" | "pending_setup";
  base_url: string;
  auth_type: string;
  auth_config: Record<string, string>;
  endpoints: Record<string, string>;
  field_mappings: Record<string, string>;
  use_case: string;
  event_triggers: string[];
  description?: string;
  priority: number;
  sync_enabled: boolean;
  sync_interval_minutes: number;
  last_sync_at?: string;
  last_sync_status?: string;
  last_sync_message?: string;
  created_at: string;
  updated_at: string;
}

interface SyncLog {
  id: string;
  integration_id: string;
  direction: string;
  status: string;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  kb_chunks_created: number;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
}

interface Assistant {
  id: string;
  friendly_name: string;
  bot_type: string;
  integrations_enabled?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

// Provider icons/colors
const PROVIDER_CONFIG: Record<string, { color: string; icon: typeof Database }> = {
  techone: { color: "bg-blue-500", icon: Building2 },
  sap: { color: "bg-amber-500", icon: Database },
  genesys: { color: "bg-purple-500", icon: Phone },
  salesforce: { color: "bg-sky-500", icon: Users },
  dynamics365: { color: "bg-green-500", icon: Building2 },
  zendesk: { color: "bg-emerald-500", icon: FileText },
  freshdesk: { color: "bg-teal-500", icon: FileText },
  custom: { color: "bg-gray-500", icon: Plug },
};

const USE_CASES = [
  { value: "general", label: "General Purpose" },
  { value: "kb_import", label: "Knowledge Base Import" },
  { value: "call_logging", label: "Call/Conversation Logging" },
  { value: "job_logging", label: "Job/Ticket Creation" },
  { value: "ticket_creation", label: "Support Ticket Creation" },
  { value: "contact_sync", label: "Contact Synchronization" },
];

const EVENT_TRIGGERS = [
  { value: "conversation_ended", label: "Conversation Ended" },
  { value: "contact_request", label: "Contact Request Captured" },
  { value: "escalation", label: "Call Escalated" },
  { value: "kb_sync", label: "Knowledge Base Sync" },
  { value: "low_score", label: "Low Score Detected" },
];

export default function Integrations() {
  const { user } = useUser();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<IntegrationTemplate[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [activeTab, setActiveTab] = useState("integrations");

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<IntegrationTemplate | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    provider: "",
    direction: "outbound" as const,
    base_url: "",
    auth_type: "api_key",
    auth_config: {} as Record<string, string>,
    endpoints: {} as Record<string, string>,
    field_mappings: {} as Record<string, string>,
    use_case: "general",
    event_triggers: [] as string[],
    description: "",
    assistant_id: "",
    priority: 100,
    sync_enabled: false,
    sync_interval_minutes: 60,
  });

  // Action states
  const [testing, setTesting] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Get current org ID
  const orgId = user?.org_id;
  const isSuperAdmin = user?.role === "super_admin";

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!orgId && !isSuperAdmin) return;

    try {
      setLoading(true);

      // Fetch templates
      const templatesRes = await fetch(`${API_BASE}/api/integrations/templates`);
      const templatesData = await templatesRes.json();
      if (templatesData.success) {
        setTemplates(templatesData.templates);
      }

      // Fetch integrations for org
      const targetOrgId = orgId || (isSuperAdmin ? "all" : null);
      if (targetOrgId) {
        const integrationsRes = await fetch(`${API_BASE}/api/integrations/org/${targetOrgId}`);
        const integrationsData = await integrationsRes.json();
        if (integrationsData.success) {
          setIntegrations(integrationsData.integrations);
        }
      }

      // Fetch assistants for linking
      const { data: assistantsData } = await supabase
        .from("assistants")
        .select("id, friendly_name, bot_type, integrations_enabled")
        .eq("org_id", orgId)
        .eq("active", true);

      if (assistantsData) {
        setAssistants(assistantsData);
      }
    } catch (error) {
      console.error("Error fetching integrations data:", error);
      toast({
        title: "Error",
        description: "Failed to load integrations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, isSuperAdmin, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch sync logs for selected integration
  const fetchSyncLogs = async (integrationId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${integrationId}/logs`);
      const data = await res.json();
      if (data.success) {
        setSyncLogs(data.logs);
      }
    } catch (error) {
      console.error("Error fetching sync logs:", error);
    }
  };

  // Test connection
  const handleTestConnection = async (integration: Integration) => {
    setTesting(integration.id);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${integration.id}/test`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Connection Successful",
          description: data.message || "Successfully connected to the external API",
        });
        fetchData(); // Refresh to show updated status
      } else {
        toast({
          title: "Connection Failed",
          description: data.message || data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  // Import KB
  const handleImportKB = async (integration: Integration) => {
    setImporting(integration.id);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${integration.id}/import-kb`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "KB Import Complete",
          description: `Imported ${data.articlesImported} articles (${data.chunksCreated} chunks created)`,
        });
        fetchData();
        if (selectedIntegration?.id === integration.id) {
          fetchSyncLogs(integration.id);
        }
      } else {
        toast({
          title: "KB Import Failed",
          description: data.message || data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to import knowledge base",
        variant: "destructive",
      });
    } finally {
      setImporting(null);
    }
  };

  // Create integration
  const handleCreate = async () => {
    if (!formData.name || !formData.provider || !formData.base_url) {
      toast({
        title: "Validation Error",
        description: "Name, provider, and base URL are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/org/${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Integration Created",
          description: `${formData.name} has been created successfully`,
        });
        setShowAddDialog(false);
        resetForm();
        fetchData();
      } else {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create integration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Update integration
  const handleUpdate = async () => {
    if (!selectedIntegration) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${selectedIntegration.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Integration Updated",
          description: "Changes saved successfully",
        });
        setShowEditDialog(false);
        setSelectedIntegration(null);
        fetchData();
      } else {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update integration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Delete integration
  const handleDelete = async (integration: Integration) => {
    try {
      const res = await fetch(`${API_BASE}/api/integrations/${integration.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        toast({
          title: "Integration Deleted",
          description: `${integration.name} has been removed`,
        });
        fetchData();
      } else {
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete integration",
        variant: "destructive",
      });
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      provider: "",
      direction: "outbound",
      base_url: "",
      auth_type: "api_key",
      auth_config: {},
      endpoints: {},
      field_mappings: {},
      use_case: "general",
      event_triggers: [],
      description: "",
      assistant_id: "",
      priority: 100,
      sync_enabled: false,
      sync_interval_minutes: 60,
    });
    setSelectedTemplate(null);
  };

  // Open edit dialog
  const openEditDialog = (integration: Integration) => {
    setSelectedIntegration(integration);
    setFormData({
      name: integration.name,
      provider: integration.provider,
      direction: integration.direction,
      base_url: integration.base_url,
      auth_type: integration.auth_type,
      auth_config: integration.auth_config || {},
      endpoints: integration.endpoints || {},
      field_mappings: integration.field_mappings || {},
      use_case: integration.use_case,
      event_triggers: integration.event_triggers || [],
      description: integration.description || "",
      assistant_id: integration.assistant_id || "",
      priority: integration.priority,
      sync_enabled: integration.sync_enabled,
      sync_interval_minutes: integration.sync_interval_minutes,
    });
    fetchSyncLogs(integration.id);
    setShowEditDialog(true);
  };

  // Apply template
  const applyTemplate = (template: IntegrationTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      ...formData,
      provider: template.provider,
      auth_type: template.default_auth_type,
      endpoints: template.default_endpoints,
      name: `${template.display_name} Integration`,
    });
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      case "inactive":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Inactive</Badge>;
      default:
        return <Badge variant="outline"><AlertTriangle className="w-3 h-3 mr-1" />Setup Required</Badge>;
    }
  };

  // Direction badge
  const getDirectionBadge = (direction: string) => {
    switch (direction) {
      case "outbound":
        return <Badge variant="outline" className="text-blue-600"><Upload className="w-3 h-3 mr-1" />Outbound</Badge>;
      case "inbound":
        return <Badge variant="outline" className="text-green-600"><Download className="w-3 h-3 mr-1" />Inbound</Badge>;
      default:
        return <Badge variant="outline" className="text-purple-600"><RefreshCw className="w-3 h-3 mr-1" />Bidirectional</Badge>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Plug className="w-8 h-8" />
              CRM Integrations
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect to external CRMs and APIs - push call data, create jobs, import knowledge bases
            </p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Add Integration
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Integration</DialogTitle>
                <DialogDescription>
                  Connect to an external CRM, call center, or API
                </DialogDescription>
              </DialogHeader>
              <IntegrationForm
                formData={formData}
                setFormData={setFormData}
                templates={templates}
                selectedTemplate={selectedTemplate}
                applyTemplate={applyTemplate}
                assistants={assistants}
                showPasswords={showPasswords}
                setShowPasswords={setShowPasswords}
                onSave={handleCreate}
                saving={saving}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Active Integrations
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Provider Templates
            </TabsTrigger>
            <TabsTrigger value="workflows" className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Event Workflows
            </TabsTrigger>
          </TabsList>

          {/* Active Integrations Tab */}
          <TabsContent value="integrations" className="space-y-4">
            {integrations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Plug className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Integrations Yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Connect your first CRM or API to start syncing data
                  </p>
                  <Button onClick={() => setShowAddDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Integration
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {integrations.map((integration) => {
                  const providerConfig = PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                  const ProviderIcon = providerConfig.icon;

                  return (
                    <Card key={integration.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-lg ${providerConfig.color}`}>
                              <ProviderIcon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg flex items-center gap-2">
                                {integration.name}
                                {getStatusBadge(integration.status)}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {integration.base_url}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                {getDirectionBadge(integration.direction)}
                                <Badge variant="outline">{integration.use_case.replace("_", " ")}</Badge>
                                {integration.assistant_id && (
                                  <Badge variant="secondary">
                                    <Users className="w-3 h-3 mr-1" />
                                    Agent-specific
                                  </Badge>
                                )}
                              </div>
                              {integration.event_triggers?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  <span className="text-xs text-muted-foreground">Triggers:</span>
                                  {integration.event_triggers.map((trigger) => (
                                    <Badge key={trigger} variant="outline" className="text-xs">
                                      {trigger.replace("_", " ")}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {integration.last_sync_at && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Last sync: {new Date(integration.last_sync_at).toLocaleString()}
                                  {integration.last_sync_status && (
                                    <span className={integration.last_sync_status === "completed" ? "text-green-600" : "text-red-600"}>
                                      {" "}({integration.last_sync_status})
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestConnection(integration)}
                              disabled={testing === integration.id}
                            >
                              {testing === integration.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <TestTube className="w-4 h-4" />
                              )}
                              <span className="ml-1 hidden sm:inline">Test</span>
                            </Button>
                            {(integration.direction === "inbound" || integration.direction === "bidirectional") &&
                              integration.use_case === "kb_import" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleImportKB(integration)}
                                disabled={importing === integration.id}
                              >
                                {importing === integration.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                                <span className="ml-1 hidden sm:inline">Import KB</span>
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(integration)}
                            >
                              <Settings className="w-4 h-4" />
                              <span className="ml-1 hidden sm:inline">Configure</span>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-red-600">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Integration?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently remove "{integration.name}" and all its sync history.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(integration)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => {
                const providerConfig = PROVIDER_CONFIG[template.provider] || PROVIDER_CONFIG.custom;
                const ProviderIcon = providerConfig.icon;

                return (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${providerConfig.color}`}>
                          <ProviderIcon className="w-5 h-5 text-white" />
                        </div>
                        <CardTitle className="text-lg">{template.display_name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        {template.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-4">
                        {template.supports_outbound && (
                          <Badge variant="outline" className="text-xs">
                            <Upload className="w-3 h-3 mr-1" />Outbound
                          </Badge>
                        )}
                        {template.supports_inbound && (
                          <Badge variant="outline" className="text-xs">
                            <Download className="w-3 h-3 mr-1" />Inbound
                          </Badge>
                        )}
                        {template.supports_kb_import && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            <BookOpen className="w-3 h-3 mr-1" />KB Import
                          </Badge>
                        )}
                      </div>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          applyTemplate(template);
                          setShowAddDialog(true);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Use This Template
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Workflows Tab */}
          <TabsContent value="workflows" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Event Workflows</CardTitle>
                <CardDescription>
                  See how events flow through your integrations. Multiple integrations can be triggered by the same event.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {EVENT_TRIGGERS.map((event) => {
                  const triggeredIntegrations = integrations.filter(
                    (i) => i.event_triggers?.includes(event.value) && i.status === "active"
                  );

                  return (
                    <div key={event.value} className="mb-6 last:mb-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-sm">
                          <Zap className="w-3 h-3 mr-1" />
                          {event.label}
                        </Badge>
                        {triggeredIntegrations.length === 0 && (
                          <span className="text-xs text-muted-foreground">No integrations configured</span>
                        )}
                      </div>
                      {triggeredIntegrations.length > 0 && (
                        <div className="flex items-center gap-2 ml-4 flex-wrap">
                          {triggeredIntegrations
                            .sort((a, b) => a.priority - b.priority)
                            .map((integration, idx) => {
                              const providerConfig = PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                              const ProviderIcon = providerConfig.icon;

                              return (
                                <div key={integration.id} className="flex items-center gap-2">
                                  {idx > 0 && <ArrowRight className="w-4 h-4 text-muted-foreground" />}
                                  <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
                                    <ProviderIcon className="w-4 h-4" />
                                    <span className="text-sm">{integration.name}</span>
                                    <Badge variant="secondary" className="text-xs ml-1">
                                      {integration.use_case.replace("_", " ")}
                                    </Badge>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Example Workflow: Council Call Handling</CardTitle>
                <CardDescription>
                  How a typical council might chain integrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Phone className="w-5 h-5 text-purple-500" />
                      <span className="font-medium">Call Ends</span>
                    </div>
                    <ArrowRight className="w-4 h-4" />
                    <div className="flex items-center gap-2 bg-purple-100 px-3 py-1 rounded">
                      <Phone className="w-4 h-4 text-purple-600" />
                      <span className="text-sm">Log to Genesys</span>
                    </div>
                    <ArrowRight className="w-4 h-4" />
                    <div className="flex items-center gap-2 bg-blue-100 px-3 py-1 rounded">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="text-sm">Create TechOne Job</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Set the priority field on each integration to control the order.
                    Lower priority numbers execute first.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Configure Integration</DialogTitle>
              <DialogDescription>
                Update settings for {selectedIntegration?.name}
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="settings">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="endpoints">Endpoints & Mappings</TabsTrigger>
                <TabsTrigger value="logs">Sync History</TabsTrigger>
              </TabsList>
              <TabsContent value="settings">
                <IntegrationForm
                  formData={formData}
                  setFormData={setFormData}
                  templates={templates}
                  selectedTemplate={null}
                  applyTemplate={() => {}}
                  assistants={assistants}
                  showPasswords={showPasswords}
                  setShowPasswords={setShowPasswords}
                  onSave={handleUpdate}
                  saving={saving}
                  isEdit
                />
              </TabsContent>
              <TabsContent value="endpoints" className="space-y-4">
                <EndpointMappingEditor
                  endpoints={formData.endpoints}
                  setEndpoints={(endpoints) => setFormData({ ...formData, endpoints })}
                  fieldMappings={formData.field_mappings}
                  setFieldMappings={(field_mappings) => setFormData({ ...formData, field_mappings })}
                />
                <DialogFooter>
                  <Button onClick={handleUpdate} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </TabsContent>
              <TabsContent value="logs">
                <SyncLogsTable logs={syncLogs} />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

// Integration Form Component
function IntegrationForm({
  formData,
  setFormData,
  templates,
  selectedTemplate,
  applyTemplate,
  assistants,
  showPasswords,
  setShowPasswords,
  onSave,
  saving,
  isEdit = false,
}: {
  formData: any;
  setFormData: (data: any) => void;
  templates: IntegrationTemplate[];
  selectedTemplate: IntegrationTemplate | null;
  applyTemplate: (template: IntegrationTemplate) => void;
  assistants: Assistant[];
  showPasswords: Record<string, boolean>;
  setShowPasswords: (data: Record<string, boolean>) => void;
  onSave: () => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  return (
    <div className="space-y-6 py-4">
      {/* Template selector (only for new) */}
      {!isEdit && (
        <div className="space-y-2">
          <Label>Provider Template</Label>
          <Select
            value={formData.provider}
            onValueChange={(value) => {
              const template = templates.find((t) => t.provider === value);
              if (template) applyTemplate(template);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a provider or custom..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.provider} value={template.provider}>
                  {template.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedTemplate?.setup_instructions && (
            <p className="text-sm text-muted-foreground whitespace-pre-line mt-2 p-3 bg-muted rounded">
              {selectedTemplate.setup_instructions}
            </p>
          )}
        </div>
      )}

      {/* Basic info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Integration Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Council TechOne CRM"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="base_url">API Base URL *</Label>
          <Input
            id="base_url"
            value={formData.base_url}
            onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
            placeholder="https://api.example.com"
          />
        </div>
      </div>

      {/* Direction & Use Case */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Direction</Label>
          <Select
            value={formData.direction}
            onValueChange={(value) => setFormData({ ...formData, direction: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound (Push data to CRM)</SelectItem>
              <SelectItem value="inbound">Inbound (Pull KB from CRM)</SelectItem>
              <SelectItem value="bidirectional">Bidirectional (Both)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Use Case</Label>
          <Select
            value={formData.use_case}
            onValueChange={(value) => setFormData({ ...formData, use_case: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USE_CASES.map((uc) => (
                <SelectItem key={uc.value} value={uc.value}>
                  {uc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Authentication */}
      <div className="space-y-4">
        <Label>Authentication</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">Auth Type</Label>
            <Select
              value={formData.auth_type}
              onValueChange={(value) => setFormData({ ...formData, auth_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="api_key">API Key</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Auth fields based on type */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
          {formData.auth_type === "api_key" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm">API Key</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.apiKey ? "text" : "password"}
                    value={formData.auth_config.apiKey || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        auth_config: { ...formData.auth_config, apiKey: e.target.value },
                      })
                    }
                    placeholder="Enter API key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPasswords({ ...showPasswords, apiKey: !showPasswords.apiKey })}
                  >
                    {showPasswords.apiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Header Name (optional)</Label>
                <Input
                  value={formData.auth_config.apiKeyHeader || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth_config: { ...formData.auth_config, apiKeyHeader: e.target.value },
                    })
                  }
                  placeholder="X-API-Key (default)"
                />
              </div>
            </>
          )}

          {formData.auth_type === "bearer" && (
            <div className="col-span-2 space-y-2">
              <Label className="text-sm">Bearer Token</Label>
              <div className="relative">
                <Input
                  type={showPasswords.token ? "text" : "password"}
                  value={formData.auth_config.accessToken || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth_config: { ...formData.auth_config, accessToken: e.target.value },
                    })
                  }
                  placeholder="Enter bearer token"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowPasswords({ ...showPasswords, token: !showPasswords.token })}
                >
                  {showPasswords.token ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {formData.auth_type === "basic" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Username</Label>
                <Input
                  value={formData.auth_config.username || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth_config: { ...formData.auth_config, username: e.target.value },
                    })
                  }
                  placeholder="Username"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Password</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.password ? "text" : "password"}
                    value={formData.auth_config.password || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        auth_config: { ...formData.auth_config, password: e.target.value },
                      })
                    }
                    placeholder="Password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPasswords({ ...showPasswords, password: !showPasswords.password })}
                  >
                    {showPasswords.password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}

          {formData.auth_type === "oauth2" && (
            <>
              <div className="space-y-2">
                <Label className="text-sm">Client ID</Label>
                <Input
                  value={formData.auth_config.clientId || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth_config: { ...formData.auth_config, clientId: e.target.value },
                    })
                  }
                  placeholder="OAuth Client ID"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Client Secret</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.secret ? "text" : "password"}
                    value={formData.auth_config.clientSecret || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        auth_config: { ...formData.auth_config, clientSecret: e.target.value },
                      })
                    }
                    placeholder="OAuth Client Secret"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPasswords({ ...showPasswords, secret: !showPasswords.secret })}
                  >
                    {showPasswords.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-sm">Token URL</Label>
                <Input
                  value={formData.auth_config.tokenUrl || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      auth_config: { ...formData.auth_config, tokenUrl: e.target.value },
                    })
                  }
                  placeholder="https://auth.example.com/oauth/token"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Event Triggers */}
      <div className="space-y-2">
        <Label>Event Triggers (when should this integration fire?)</Label>
        <div className="flex flex-wrap gap-2">
          {EVENT_TRIGGERS.map((event) => (
            <Badge
              key={event.value}
              variant={formData.event_triggers?.includes(event.value) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const triggers = formData.event_triggers || [];
                if (triggers.includes(event.value)) {
                  setFormData({
                    ...formData,
                    event_triggers: triggers.filter((t: string) => t !== event.value),
                  });
                } else {
                  setFormData({
                    ...formData,
                    event_triggers: [...triggers, event.value],
                  });
                }
              }}
            >
              {event.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Assistant Assignment */}
      <div className="space-y-2">
        <Label>Assign to Specific Agent (optional)</Label>
        <Select
          value={formData.assistant_id || "org-wide"}
          onValueChange={(value) =>
            setFormData({ ...formData, assistant_id: value === "org-wide" ? "" : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Organization-wide (all agents)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="org-wide">Organization-wide (all agents)</SelectItem>
            {assistants.map((assistant) => (
              <SelectItem key={assistant.id} value={assistant.id}>
                {assistant.friendly_name} ({assistant.bot_type})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Leave as org-wide for all agents, or select a specific agent
        </p>
      </div>

      {/* Priority */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">Priority (lower = runs first)</Label>
          <Input
            id="priority"
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })}
            min={1}
            max={999}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional notes about this integration"
          />
        </div>
      </div>

      {/* Sync settings for inbound */}
      {(formData.direction === "inbound" || formData.direction === "bidirectional") && (
        <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Sync</Label>
              <p className="text-xs text-muted-foreground">Automatically sync KB on a schedule</p>
            </div>
            <Switch
              checked={formData.sync_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, sync_enabled: checked })}
            />
          </div>
          {formData.sync_enabled && (
            <div className="space-y-2">
              <Label>Sync Interval (minutes)</Label>
              <Input
                type="number"
                value={formData.sync_interval_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, sync_interval_minutes: parseInt(e.target.value) || 60 })
                }
                min={15}
                max={1440}
              />
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {isEdit ? "Save Changes" : "Create Integration"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// Endpoint & Field Mapping Editor
function EndpointMappingEditor({
  endpoints,
  setEndpoints,
  fieldMappings,
  setFieldMappings,
}: {
  endpoints: Record<string, string>;
  setEndpoints: (endpoints: Record<string, string>) => void;
  fieldMappings: Record<string, string>;
  setFieldMappings: (mappings: Record<string, string>) => void;
}) {
  const [newEndpointKey, setNewEndpointKey] = useState("");
  const [newEndpointValue, setNewEndpointValue] = useState("");
  const [newMappingKey, setNewMappingKey] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");

  return (
    <div className="space-y-6">
      {/* Endpoints */}
      <div className="space-y-4">
        <Label className="text-lg font-semibold">API Endpoints</Label>
        <p className="text-sm text-muted-foreground">
          Configure the API paths for different actions
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Endpoint Path</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(endpoints).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell>
                  <Input
                    value={value}
                    onChange={(e) => setEndpoints({ ...endpoints, [key]: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newEndpoints = { ...endpoints };
                      delete newEndpoints[key];
                      setEndpoints(newEndpoints);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Input
                  value={newEndpointKey}
                  onChange={(e) => setNewEndpointKey(e.target.value)}
                  placeholder="Action name"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newEndpointValue}
                  onChange={(e) => setNewEndpointValue(e.target.value)}
                  placeholder="/api/path"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (newEndpointKey && newEndpointValue) {
                      setEndpoints({ ...endpoints, [newEndpointKey]: newEndpointValue });
                      setNewEndpointKey("");
                      setNewEndpointValue("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Field Mappings */}
      <div className="space-y-4">
        <Label className="text-lg font-semibold">Field Mappings</Label>
        <p className="text-sm text-muted-foreground">
          Map our field names to the external API's field names
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Our Field</TableHead>
              <TableHead>External Field</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(fieldMappings).map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-medium">{key}</TableCell>
                <TableCell>
                  <Input
                    value={value}
                    onChange={(e) => setFieldMappings({ ...fieldMappings, [key]: e.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newMappings = { ...fieldMappings };
                      delete newMappings[key];
                      setFieldMappings(newMappings);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Input
                  value={newMappingKey}
                  onChange={(e) => setNewMappingKey(e.target.value)}
                  placeholder="customerName"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={newMappingValue}
                  onChange={(e) => setNewMappingValue(e.target.value)}
                  placeholder="ContactName"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (newMappingKey && newMappingValue) {
                      setFieldMappings({ ...fieldMappings, [newMappingKey]: newMappingValue });
                      setNewMappingKey("");
                      setNewMappingValue("");
                    }
                  }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Sync Logs Table
function SyncLogsTable({ logs }: { logs: SyncLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No sync history yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Direction</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Records</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="text-sm">
              {new Date(log.created_at).toLocaleString()}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {log.direction === "inbound" ? (
                  <Download className="w-3 h-3 mr-1" />
                ) : (
                  <Upload className="w-3 h-3 mr-1" />
                )}
                {log.direction}
              </Badge>
            </TableCell>
            <TableCell>
              {log.status === "completed" ? (
                <Badge className="bg-green-500">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Success
                </Badge>
              ) : log.status === "failed" ? (
                <Badge variant="destructive">
                  <XCircle className="w-3 h-3 mr-1" />
                  Failed
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <Clock className="w-3 h-3 mr-1" />
                  {log.status}
                </Badge>
              )}
            </TableCell>
            <TableCell>
              <span className="text-green-600">{log.records_succeeded}</span>
              {log.records_failed > 0 && (
                <span className="text-red-600"> / {log.records_failed}</span>
              )}
              {log.kb_chunks_created > 0 && (
                <span className="text-muted-foreground ml-1">
                  ({log.kb_chunks_created} chunks)
                </span>
              )}
            </TableCell>
            <TableCell>
              {log.duration_seconds ? `${log.duration_seconds}s` : "-"}
            </TableCell>
            <TableCell className="max-w-xs truncate text-xs">
              {log.error_message || "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
