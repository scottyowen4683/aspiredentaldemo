import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { fetchOrganizations } from "@/services/organizationService";
import { fetchAssistants, AssistantRow } from "@/services/assistantService";
import { cn } from "@/lib/utils";
import {
  Plus, Play, Pause, Trash2, Upload, Users, Phone, Calendar,
  Clock, Target, TrendingUp, AlertCircle, CheckCircle, XCircle,
  PhoneOff, Loader2, FileSpreadsheet, Settings, BarChart3
} from "lucide-react";

interface Campaign {
  id: string;
  org_id: string;
  assistant_id: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "paused" | "completed";
  start_date?: string;
  end_date?: string;
  call_hours_start?: string;
  call_hours_end?: string;
  timezone?: string;
  max_concurrent_calls?: number;
  calls_per_minute?: number;
  total_contacts?: number;
  contacted?: number;
  successful?: number;
  failed?: number;
  created_at: string;
}

interface CampaignStats {
  total_contacts: number;
  contacted: number;
  successful: number;
  failed: number;
  pending: number;
  completed: number;
  no_answer: number;
  busy: number;
  progress_percentage: number;
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [assistants, setAssistants] = useState<AssistantRow[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignStats, setCampaignStats] = useState<Record<string, CampaignStats>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveOrgId = user?.role === "org_admin" ? user?.org_id : null;

  // Form state for new campaign
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    assistant_id: "",
    org_id: "",
    start_date: "",
    end_date: "",
    call_hours_start: "09:00",
    call_hours_end: "17:00",
    timezone: "Australia/Sydney",
    max_concurrent_calls: 5,
    calls_per_minute: 2,
    // Outbound-specific fields
    outbound_prompt: "",
    first_message: "",
  });

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load campaigns
        const orgFilter = effectiveOrgId ? `?org_id=${effectiveOrgId}` : "";
        const campaignsRes = await fetch(`/api/campaigns${orgFilter}`);
        if (campaignsRes.ok) {
          const data = await campaignsRes.json();
          setCampaigns(data.campaigns || []);

          // Load stats for each campaign
          const statsPromises = (data.campaigns || []).map(async (c: Campaign) => {
            try {
              const statsRes = await fetch(`/api/campaigns/${c.id}/stats`);
              if (statsRes.ok) {
                const stats = await statsRes.json();
                return { id: c.id, stats };
              }
            } catch (e) {
              console.error(`Failed to load stats for campaign ${c.id}`, e);
            }
            return null;
          });

          const statsResults = await Promise.all(statsPromises);
          const statsMap: Record<string, CampaignStats> = {};
          statsResults.forEach((r) => {
            if (r) statsMap[r.id] = r.stats;
          });
          setCampaignStats(statsMap);
        }

        // Load assistants (voice only for campaigns)
        const assistantsData = await fetchAssistants();
        const voiceAssistants = assistantsData.filter(a => a.assistant_type === "voice" || a.bot_type === "voice");
        setAssistants(voiceAssistants);

        // Load organizations for super admin
        if (user?.role === "super_admin") {
          const orgs = await fetchOrganizations();
          setOrganizations(orgs);
        }
      } catch (err) {
        console.error("Failed to load campaigns", err);
        toast({ title: "Error", description: "Failed to load campaigns", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, effectiveOrgId]);

  const handleCreateCampaign = async () => {
    if (!formData.name || !formData.assistant_id) {
      toast({ title: "Error", description: "Name and assistant are required", variant: "destructive" });
      return;
    }

    const orgId = effectiveOrgId || formData.org_id;
    if (!orgId) {
      toast({ title: "Error", description: "Please select an organization", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, org_id: orgId }),
      });

      if (res.ok) {
        const data = await res.json();
        setCampaigns((prev) => [data.campaign, ...prev]);
        setIsCreateModalOpen(false);
        setFormData({
          name: "",
          description: "",
          assistant_id: "",
          org_id: "",
          start_date: "",
          end_date: "",
          call_hours_start: "09:00",
          call_hours_end: "17:00",
          timezone: "Australia/Sydney",
          max_concurrent_calls: 5,
          calls_per_minute: 2,
          outbound_prompt: "",
          first_message: "",
        });
        toast({ title: "Success", description: "Campaign created successfully" });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to create campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to create campaign", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartCampaign = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/start`, { method: "POST" });
      if (res.ok) {
        setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, status: "active" } : c)));
        toast({ title: "Success", description: "Campaign started" });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to start campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to start campaign", variant: "destructive" });
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/pause`, { method: "POST" });
      if (res.ok) {
        setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, status: "paused" } : c)));
        toast({ title: "Success", description: "Campaign paused" });
      } else {
        toast({ title: "Error", description: "Failed to pause campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to pause campaign", variant: "destructive" });
    }
  };

  const handleRunNow = async (campaignId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, status: "active" } : c)));
        toast({ title: "Calls Initiated", description: data.message });

        // Refresh stats after a short delay
        setTimeout(async () => {
          const statsRes = await fetch(`/api/campaigns/${campaignId}/stats`);
          if (statsRes.ok) {
            const stats = await statsRes.json();
            setCampaignStats((prev) => ({ ...prev, [campaignId]: stats.stats }));
          }
        }, 2000);
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to run campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to run campaign", variant: "destructive" });
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      if (res.ok) {
        setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
        toast({ title: "Success", description: "Campaign deleted" });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to delete campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete campaign", variant: "destructive" });
    }
  };

  const handleEditCampaign = async (campaign: Campaign) => {
    // Fetch full campaign details including outbound fields
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`);
      if (res.ok) {
        const data = await res.json();
        const fullCampaign = data.campaign;
        setEditingCampaign(fullCampaign);
        setFormData({
          name: fullCampaign.name || "",
          description: fullCampaign.description || "",
          assistant_id: fullCampaign.assistant_id || "",
          org_id: fullCampaign.org_id || "",
          start_date: fullCampaign.start_date?.split("T")[0] || "",
          end_date: fullCampaign.end_date?.split("T")[0] || "",
          call_hours_start: fullCampaign.call_hours_start?.slice(0, 5) || "09:00",
          call_hours_end: fullCampaign.call_hours_end?.slice(0, 5) || "17:00",
          timezone: fullCampaign.timezone || "Australia/Sydney",
          max_concurrent_calls: fullCampaign.max_concurrent_calls || 5,
          calls_per_minute: fullCampaign.calls_per_minute || 2,
          outbound_prompt: fullCampaign.outbound_prompt || "",
          first_message: fullCampaign.first_message || "",
        });
        setIsEditModalOpen(true);
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to load campaign details", variant: "destructive" });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingCampaign) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${editingCampaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          assistant_id: formData.assistant_id,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          call_hours_start: formData.call_hours_start,
          call_hours_end: formData.call_hours_end,
          timezone: formData.timezone,
          max_concurrent_calls: formData.max_concurrent_calls,
          calls_per_minute: formData.calls_per_minute,
          outbound_prompt: formData.outbound_prompt || null,
          first_message: formData.first_message || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCampaigns((prev) => prev.map((c) => (c.id === editingCampaign.id ? data.campaign : c)));
        setIsEditModalOpen(false);
        setEditingCampaign(null);
        toast({ title: "Success", description: "Campaign updated successfully" });
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to update campaign", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to update campaign", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadContacts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCampaign) return;

    const formDataUpload = new FormData();
    formDataUpload.append("file", file);

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${selectedCampaign.id}/contacts/upload`, {
        method: "POST",
        body: formDataUpload,
      });

      if (res.ok) {
        const data = await res.json();
        toast({ title: "Success", description: `Uploaded ${data.imported} contacts` });

        // Refresh stats
        const statsRes = await fetch(`/api/campaigns/${selectedCampaign.id}/stats`);
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setCampaignStats((prev) => ({ ...prev, [selectedCampaign.id]: stats }));
        }

        setIsUploadModalOpen(false);
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.error || "Failed to upload contacts", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to upload contacts", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 border-gray-200",
      active: "bg-green-100 text-green-700 border-green-200",
      paused: "bg-yellow-100 text-yellow-700 border-yellow-200",
      completed: "bg-blue-100 text-blue-700 border-blue-200",
    };
    return <Badge className={cn("capitalize", styles[status] || "")}>{status}</Badge>;
  };

  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Outbound Campaigns
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Create and manage automated outbound calling campaigns
            </p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Campaign
          </Button>
        </div>

        {/* Campaigns Grid */}
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Phone className="h-16 w-16 text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No Campaigns Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Create your first outbound calling campaign to automatically reach out to contacts with your AI voice assistant.
              </p>
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => {
              const stats = campaignStats[campaign.id];
              const progress = stats?.progress_percentage || 0;

              return (
                <Card key={campaign.id} className="shadow-card hover:shadow-elegant transition-all">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        {campaign.description && (
                          <CardDescription className="mt-1 line-clamp-2">
                            {campaign.description}
                          </CardDescription>
                        )}
                      </div>
                      {getStatusBadge(campaign.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    {/* Stats Grid */}
                    {stats && (
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="p-2 bg-muted/50 rounded-lg">
                          <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                          <p className="text-lg font-bold">{stats.total_contacts}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
                          <CheckCircle className="h-4 w-4 mx-auto text-green-600 mb-1" />
                          <p className="text-lg font-bold text-green-600">{stats.successful}</p>
                          <p className="text-xs text-muted-foreground">Success</p>
                        </div>
                        <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                          <XCircle className="h-4 w-4 mx-auto text-red-600 mb-1" />
                          <p className="text-lg font-bold text-red-600">{stats.failed}</p>
                          <p className="text-xs text-muted-foreground">Failed</p>
                        </div>
                        <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                          <PhoneOff className="h-4 w-4 mx-auto text-yellow-600 mb-1" />
                          <p className="text-lg font-bold text-yellow-600">{stats.no_answer}</p>
                          <p className="text-xs text-muted-foreground">No Answer</p>
                        </div>
                      </div>
                    )}

                    {/* Call Hours */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {campaign.call_hours_start || "09:00"} - {campaign.call_hours_end || "17:00"} ({campaign.timezone || "UTC"})
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      {campaign.status === "draft" || campaign.status === "paused" ? (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                            onClick={() => handleRunNow(campaign.id)}
                            disabled={!stats?.total_contacts || stats.total_contacts === 0}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Run Now
                          </Button>
                        </>
                      ) : campaign.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handlePauseCampaign(campaign.id)}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      ) : null}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setIsUploadModalOpen(true);
                        }}
                      >
                        <Upload className="h-3 w-3" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditCampaign(campaign)}
                      >
                        <Settings className="h-3 w-3" />
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteCampaign(campaign.id)}
                        disabled={campaign.status === "active"}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-blue-500" />
              Create Outbound Campaign
            </DialogTitle>
            <DialogDescription>
              Set up an automated outbound calling campaign with your AI voice assistant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input
                  placeholder="e.g. Q1 Customer Outreach"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {user?.role === "super_admin" && (
                <div className="space-y-2">
                  <Label>Organization *</Label>
                  <Select value={formData.org_id} onValueChange={(v) => setFormData({ ...formData, org_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name || org.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Voice Assistant *</Label>
              <Select value={formData.assistant_id} onValueChange={(v) => setFormData({ ...formData, assistant_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select voice assistant" />
                </SelectTrigger>
                <SelectContent>
                  {assistants.map((assistant) => (
                    <SelectItem key={assistant.id} value={assistant.id}>
                      {assistant.friendly_name || assistant.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assistants.length === 0 && (
                <p className="text-xs text-yellow-600">No voice assistants available. Create one first.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Campaign description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Outbound-specific fields */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium text-sm mb-3 text-muted-foreground">Outbound Call Settings</h4>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Opening Message</Label>
                  <Textarea
                    placeholder="What the AI says when the call is answered, e.g. 'Hi, this is Sarah from ABC Company. I'm calling about...'"
                    value={formData.first_message}
                    onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to use the assistant's default greeting</p>
                </div>

                <div className="space-y-2">
                  <Label>Campaign Prompt</Label>
                  <Textarea
                    placeholder="Custom instructions for this campaign, e.g. 'You are calling to follow up on their recent enquiry about...'"
                    value={formData.outbound_prompt}
                    onChange={(e) => setFormData({ ...formData, outbound_prompt: e.target.value })}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank to use the assistant's default prompt</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Call Hours Start</Label>
                <Input
                  type="time"
                  value={formData.call_hours_start}
                  onChange={(e) => setFormData({ ...formData, call_hours_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Call Hours End</Label>
                <Input
                  type="time"
                  value={formData.call_hours_end}
                  onChange={(e) => setFormData({ ...formData, call_hours_end: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                    <SelectItem value="Australia/Melbourne">Melbourne (AEST)</SelectItem>
                    <SelectItem value="Australia/Brisbane">Brisbane (AEST)</SelectItem>
                    <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Concurrent Calls</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.max_concurrent_calls}
                  onChange={(e) => setFormData({ ...formData, max_concurrent_calls: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Calls Per Minute</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.calls_per_minute}
                  onChange={(e) => setFormData({ ...formData, calls_per_minute: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCampaign}
              disabled={isSubmitting}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Contacts Modal */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-500" />
              Upload Contacts
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file with contacts for "{selectedCampaign?.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload a CSV file with columns: phone_number, first_name, last_name, email
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleUploadContacts}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Choose CSV File
              </Button>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-sm">CSV Format Example:</h4>
              <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                phone_number,first_name,last_name,email<br />
                +61412345678,John,Smith,john@example.com<br />
                +61423456789,Jane,Doe,jane@example.com
              </code>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Campaign Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={(open) => {
        setIsEditModalOpen(open);
        if (!open) setEditingCampaign(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-500" />
              Edit Campaign
            </DialogTitle>
            <DialogDescription>
              Update the settings for "{editingCampaign?.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input
                  placeholder="e.g. Q1 Customer Outreach"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Voice Assistant</Label>
                <Select value={formData.assistant_id} onValueChange={(v) => setFormData({ ...formData, assistant_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants.map((assistant) => (
                      <SelectItem key={assistant.id} value={assistant.id}>
                        {assistant.friendly_name || assistant.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Campaign description..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Outbound-specific fields */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium text-sm mb-3 text-muted-foreground">Outbound Call Settings</h4>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Opening Message</Label>
                  <Textarea
                    placeholder="What the AI says when the call is answered..."
                    value={formData.first_message}
                    onChange={(e) => setFormData({ ...formData, first_message: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Campaign Prompt</Label>
                  <Textarea
                    placeholder="Custom instructions for this campaign..."
                    value={formData.outbound_prompt}
                    onChange={(e) => setFormData({ ...formData, outbound_prompt: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (Optional)</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Call Hours Start</Label>
                <Input
                  type="time"
                  value={formData.call_hours_start}
                  onChange={(e) => setFormData({ ...formData, call_hours_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Call Hours End</Label>
                <Input
                  type="time"
                  value={formData.call_hours_end}
                  onChange={(e) => setFormData({ ...formData, call_hours_end: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={formData.timezone} onValueChange={(v) => setFormData({ ...formData, timezone: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Australia/Sydney">Sydney (AEST)</SelectItem>
                    <SelectItem value="Australia/Melbourne">Melbourne (AEST)</SelectItem>
                    <SelectItem value="Australia/Brisbane">Brisbane (AEST)</SelectItem>
                    <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEditModalOpen(false);
              setEditingCampaign(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
