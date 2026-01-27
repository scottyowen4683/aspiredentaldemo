import { useState, useEffect, useRef } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, Phone, MessageSquare, Mic, Upload, FileText, X, Loader2, Plus, Building2, Globe, Link2, Copy, ExternalLink, Image } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createAssistant, updateAssistant, AssistantRow, generatePilotSlug, uploadPilotLogo, PilotConfig } from "@/services/assistantService";
import { useUser } from "@/context/UserContext";
import { fetchOrganizations } from "@/services/organizationService";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AddAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: AssistantRow | null;
  onSuccess?: () => void;
}

interface FormData {
  friendlyName: string;
  assistantType: "voice" | "chat";
  phoneNumber: string;
  voiceSelectionMode: "preset" | "custom";
  elevenLabsVoiceId: string;
  customVoiceId: string;
  prompt: string;
  useDefaultPrompt: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  firstMessage: string;
  kbEnabled: boolean;
  kbFile: File | null;
  kbText: string;
  orgId?: string | null;
  autoScore: boolean;
  backgroundSound: "none" | "office" | "cafe";
  backgroundVolume: number;
  // New feature fields
  callTransferEnabled: boolean;
  callTransferNumber: string;
  smsEnabled: boolean;
  smsNotificationNumber: string;
  emailNotificationsEnabled: boolean;
  emailNotificationAddress: string;
  // Data retention policy
  dataRetentionDays: number;
  // Pilot mode fields
  pilotEnabled: boolean;
  pilotCompanyName: string;
  pilotGreeting: string;
  pilotLogoFile: File | null;
  pilotLogoUrl: string;
  pilotTestQuestions: string;
  pilotScope: string;
}

const DEFAULT_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel - American Female (Calm)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi - American Female (Strong)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella - American Female (Soft)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni - American Male (Well-rounded)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli - American Female (Emotional)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh - American Male (Deep)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold - American Male (Crisp)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam - American Male (Deep)" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam - American Male (Raspy)" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel - British Male (Deep)" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte - Swedish Female (Seductive)" },
];

export function AddAssistantModal({ open, onOpenChange, initialData, onSuccess }: AddAssistantModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingKb, setIsUploadingKb] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const [organizations, setOrganizations] = useState<{ id: string; name?: string | null }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Inline org creation state
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  const [formData, setFormData] = useState<FormData>({
    friendlyName: "",
    assistantType: "voice",
    phoneNumber: "",
    voiceSelectionMode: "preset",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    customVoiceId: "",
    prompt: "",
    useDefaultPrompt: true,
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1000,
    firstMessage: "Hello, how can I help you today?",
    kbEnabled: false,
    kbFile: null,
    kbText: "",
    orgId: null,
    autoScore: true,
    backgroundSound: "none",
    backgroundVolume: 0.15,
    // New feature defaults
    callTransferEnabled: false,
    callTransferNumber: "",
    smsEnabled: false,
    smsNotificationNumber: "",
    emailNotificationsEnabled: true,
    emailNotificationAddress: "",
    // Data retention policy (default 90 days)
    dataRetentionDays: 90,
    // Pilot mode defaults
    pilotEnabled: false,
    pilotCompanyName: "",
    pilotGreeting: "",
    pilotLogoFile: null,
    pilotLogoUrl: "",
    pilotTestQuestions: "",
    pilotScope: "",
  });

  // Fetch organizations for super_admin
  useEffect(() => {
    let mounted = true;
    const loadOrgs = async () => {
      if (user?.role !== "super_admin") return;
      try {
        const orgs = await fetchOrganizations();
        if (!mounted) return;
        setOrganizations(orgs);
      } catch (e) {
        console.error("Failed to load organizations", e);
      }
    };
    loadOrgs();
    return () => { mounted = false; };
  }, [user]);

  // Pre-fill orgId for org_admin
  useEffect(() => {
    if (user?.role === "org_admin" && user?.org_id) {
      setFormData((prev) => ({ ...prev, orgId: user.org_id }));
    }
  }, [user]);

  // Handle inline organization creation
  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) {
      toast({ title: "Error", description: "Organization name is required", variant: "destructive" });
      return;
    }

    setIsCreatingOrg(true);
    try {
      // Generate slug from name
      const slug = newOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const response = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgName.trim(),
          slug,
          flat_rate_fee: 500.00,
          included_interactions: 5000,
          overage_rate_per_1000: 50.00
        })
      });

      const result = await response.json();

      if (result.success && result.organization) {
        // Add to organizations list
        setOrganizations(prev => [...prev, { id: result.organization.id, name: result.organization.name }]);
        // Select the new org
        setFormData(prev => ({ ...prev, orgId: result.organization.id }));
        // Reset form
        setNewOrgName("");
        setShowNewOrgForm(false);
        toast({ title: "Organization Created", description: `${result.organization.name} has been created and selected.` });
      } else {
        throw new Error(result.error || "Failed to create organization");
      }
    } catch (error) {
      console.error("Error creating organization:", error);
      toast({ title: "Error", description: "Failed to create organization", variant: "destructive" });
    } finally {
      setIsCreatingOrg(false);
    }
  };

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (initialData) {
        const isCustomVoice = initialData.elevenlabs_voice_id &&
          !DEFAULT_VOICES.some(v => v.id === initialData.elevenlabs_voice_id);

        setFormData({
          friendlyName: initialData.friendly_name ?? "",
          assistantType: (initialData.assistant_type as "voice" | "chat") ?? "voice",
          phoneNumber: initialData.phone_number ?? "",
          voiceSelectionMode: isCustomVoice ? "custom" : "preset",
          elevenLabsVoiceId: isCustomVoice ? "21m00Tcm4TlvDq8ikWAM" : (initialData.elevenlabs_voice_id ?? "21m00Tcm4TlvDq8ikWAM"),
          customVoiceId: isCustomVoice ? (initialData.elevenlabs_voice_id ?? "") : "",
          prompt: initialData.prompt ?? "",
          useDefaultPrompt: initialData.use_default_prompt ?? true,
          model: initialData.model ?? "gpt-4o-mini",
          temperature: initialData.temperature ?? 0.7,
          maxTokens: initialData.max_tokens ?? 1000,
          firstMessage: initialData.first_message ?? "Hello, how can I help you today?",
          kbEnabled: initialData.kb_enabled ?? false,
          kbFile: null,
          kbText: "",
          orgId: initialData.org_id ?? null,
          autoScore: initialData.auto_score ?? true,
          backgroundSound: (initialData.background_sound as "none" | "office" | "cafe") ?? "none",
          backgroundVolume: initialData.background_volume ?? 0.15,
          // Feature fields
          callTransferEnabled: initialData.call_transfer_enabled ?? false,
          callTransferNumber: initialData.call_transfer_number ?? "",
          smsEnabled: initialData.sms_enabled ?? false,
          smsNotificationNumber: initialData.sms_notification_number ?? "",
          emailNotificationsEnabled: initialData.email_notifications_enabled ?? true,
          emailNotificationAddress: initialData.email_notification_address ?? "",
          // Data retention policy
          dataRetentionDays: initialData.data_retention_days ?? 90,
          // Pilot mode fields
          pilotEnabled: initialData.pilot_enabled ?? false,
          pilotCompanyName: (initialData.pilot_config as PilotConfig)?.companyName ?? "",
          pilotGreeting: (initialData.pilot_config as PilotConfig)?.greeting ?? "",
          pilotLogoFile: null,
          pilotLogoUrl: initialData.pilot_logo_url ?? "",
          pilotTestQuestions: (initialData.pilot_config as PilotConfig)?.testQuestions?.join("\n") ?? "",
          pilotScope: (initialData.pilot_config as PilotConfig)?.scope?.join("\n") ?? "",
        });
      } else {
        // Reset to defaults for new assistant
        setFormData({
          friendlyName: "",
          assistantType: "voice",
          phoneNumber: "",
          voiceSelectionMode: "preset",
          elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
          customVoiceId: "",
          prompt: "",
          useDefaultPrompt: true,
          model: "gpt-4o-mini",
          temperature: 0.7,
          maxTokens: 1000,
          firstMessage: "Hello, how can I help you today?",
          kbEnabled: false,
          kbFile: null,
          kbText: "",
          orgId: user?.role === "org_admin" ? user?.org_id ?? null : null,
          autoScore: true,
          backgroundSound: "none",
          backgroundVolume: 0.15,
          // Feature defaults
          callTransferEnabled: false,
          callTransferNumber: "",
          smsEnabled: false,
          smsNotificationNumber: "",
          emailNotificationsEnabled: true,
          emailNotificationAddress: "",
          dataRetentionDays: 90,
          // Pilot mode defaults
          pilotEnabled: false,
          pilotCompanyName: "",
          pilotGreeting: "",
          pilotLogoFile: null,
          pilotLogoUrl: "",
          pilotTestQuestions: "",
          pilotScope: "",
        });
      }
    }
  }, [initialData, open, user]);

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: "Error", description: "File size must be less than 10MB", variant: "destructive" });
        return;
      }
      const allowedTypes = ['.txt', '.pdf', '.docx'];
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!allowedTypes.includes(ext)) {
        toast({ title: "Error", description: "Only TXT, PDF, and DOCX files are supported", variant: "destructive" });
        return;
      }
      handleChange("kbFile", file);
      handleChange("kbEnabled", true);
    }
  };

  const removeFile = () => {
    handleChange("kbFile", null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit for logos
        toast({ title: "Error", description: "Logo file must be less than 5MB", variant: "destructive" });
        return;
      }
      const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast({ title: "Error", description: "Only PNG, JPEG, SVG, and WebP images are supported", variant: "destructive" });
        return;
      }
      handleChange("pilotLogoFile", file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      handleChange("pilotLogoUrl", previewUrl);
    }
  };

  const removeLogo = () => {
    handleChange("pilotLogoFile", null);
    handleChange("pilotLogoUrl", "");
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
  };

  const getEffectiveVoiceId = () => {
    if (formData.voiceSelectionMode === "custom" && formData.customVoiceId.trim()) {
      return formData.customVoiceId.trim();
    }
    return formData.elevenLabsVoiceId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.friendlyName.trim()) {
        toast({ title: "Error", description: "Assistant name is required", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      if (formData.assistantType === "voice" && !formData.phoneNumber.trim()) {
        toast({ title: "Error", description: "Phone number is required for voice assistants", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      if (formData.voiceSelectionMode === "custom" && formData.assistantType === "voice" && !formData.customVoiceId.trim()) {
        toast({ title: "Error", description: "Please enter a custom ElevenLabs voice ID", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      const orgId = user?.role === "org_admin" ? user?.org_id ?? null : formData.orgId;
      if (!orgId) {
        toast({ title: "Error", description: "Please select an organization", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      // Build payload for backend API
      const payload = {
        org_id: orgId,
        friendly_name: formData.friendlyName,
        bot_type: formData.assistantType,
        phone_number: formData.assistantType === "voice" ? formData.phoneNumber : null,
        elevenlabs_voice_id: formData.assistantType === "voice" ? getEffectiveVoiceId() : null,
        prompt: formData.useDefaultPrompt ? "[Uses Default Prompt]" : (formData.prompt || ""),
        use_default_prompt: formData.useDefaultPrompt,
        model: formData.model,
        temperature: formData.temperature,
        max_tokens: formData.maxTokens,
        first_message: formData.firstMessage || null,
        kb_enabled: formData.kbEnabled,
        auto_score: formData.autoScore,
        background_sound: formData.assistantType === "voice" ? formData.backgroundSound : null,
        background_volume: formData.assistantType === "voice" ? formData.backgroundVolume : null,
        // Feature settings
        call_transfer_enabled: formData.assistantType === "voice" ? formData.callTransferEnabled : false,
        call_transfer_number: formData.assistantType === "voice" && formData.callTransferEnabled ? formData.callTransferNumber : null,
        sms_enabled: formData.smsEnabled,
        sms_notification_number: formData.smsEnabled ? formData.smsNotificationNumber : null,
        email_notifications_enabled: formData.emailNotificationsEnabled,
        email_notification_address: formData.emailNotificationsEnabled ? formData.emailNotificationAddress : null,
        // Data retention policy
        data_retention_days: formData.dataRetentionDays,
        // Pilot mode (only for chat bots)
        pilot_enabled: formData.assistantType === "chat" ? formData.pilotEnabled : false,
        pilot_slug: formData.assistantType === "chat" && formData.pilotEnabled
          ? (initialData?.pilot_slug || await generatePilotSlug(formData.pilotCompanyName || formData.friendlyName))
          : null,
        pilot_config: formData.assistantType === "chat" && formData.pilotEnabled
          ? {
              companyName: formData.pilotCompanyName || formData.friendlyName,
              greeting: formData.pilotGreeting || formData.firstMessage,
              title: `${formData.pilotCompanyName || formData.friendlyName} AI Chat Pilot`,
              testQuestions: formData.pilotTestQuestions.split("\n").filter(q => q.trim()),
              scope: formData.pilotScope.split("\n").filter(s => s.trim()),
            }
          : null,
      };

      let result;
      if (initialData?.id) {
        result = await updateAssistant(initialData.id, payload, user?.id);
      } else {
        result = await createAssistant(payload, user?.id);
      }

      if (result.success) {
        const assistantId = result.data?.id || initialData?.id;

        // If KB file is selected, upload it
        if (formData.kbFile && assistantId) {
          setIsUploadingKb(true);
          try {
            const formDataUpload = new FormData();
            formDataUpload.append('file', formData.kbFile);
            formDataUpload.append('org_id', orgId);
            formDataUpload.append('assistant_id', assistantId);

            const uploadResponse = await fetch('/api/admin/knowledge-base/upload', {
              method: 'POST',
              body: formDataUpload,
            });

            if (!uploadResponse.ok) {
              console.error('KB upload failed:', await uploadResponse.text());
              toast({ title: "Warning", description: "Assistant created but knowledge base upload failed", variant: "destructive" });
            }
          } catch (kbError) {
            console.error('KB upload error:', kbError);
          } finally {
            setIsUploadingKb(false);
          }
        }

        // If KB text is provided, upload it
        if (formData.kbText.trim() && assistantId) {
          setIsUploadingKb(true);
          try {
            const textResponse = await fetch('/api/admin/knowledge-base/text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                org_id: orgId,
                assistant_id: assistantId,
                text: formData.kbText,
                source: 'manual_input',
              }),
            });

            if (!textResponse.ok) {
              console.error('KB text upload failed:', await textResponse.text());
            }
          } catch (kbError) {
            console.error('KB text upload error:', kbError);
          } finally {
            setIsUploadingKb(false);
          }
        }

        // If pilot logo is selected, upload it
        if (formData.pilotLogoFile && assistantId && formData.pilotEnabled) {
          try {
            const logoResult = await uploadPilotLogo(formData.pilotLogoFile, assistantId);
            if (logoResult.success && logoResult.url) {
              // Update assistant with logo URL
              await updateAssistant(assistantId, { pilot_logo_url: logoResult.url }, user?.id);
            } else {
              console.error('Pilot logo upload failed:', logoResult.error);
              toast({ title: "Warning", description: "Assistant created but logo upload failed", variant: "destructive" });
            }
          } catch (logoError) {
            console.error('Pilot logo upload error:', logoError);
          }
        }

        toast({
          title: initialData?.id ? "Assistant Updated" : "Assistant Created",
          description: `${formData.friendlyName} has been ${initialData?.id ? "updated" : "created"} successfully.${formData.pilotEnabled ? ` Pilot page URL: /pilot/${payload.pilot_slug}` : ''}`
        });
        onOpenChange(false);
        onSuccess?.();
      } else {
        const errorMsg = typeof result.error === 'object' && result.error?.message
          ? result.error.message
          : String(result.error);
        toast({ title: "Error", description: errorMsg, variant: "destructive" });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Unexpected error occurred", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {formData.assistantType === "voice" ? (
              <Phone className="h-5 w-5 text-blue-500" />
            ) : (
              <MessageSquare className="h-5 w-5 text-green-500" />
            )}
            {initialData?.id ? "Edit Assistant" : "Create New Assistant"}
          </DialogTitle>
          <DialogDescription>
            Configure your Aspire AI assistant for {formData.assistantType === "voice" ? "voice calls" : "chat conversations"}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Assistant Type Selection */}
          <div className="space-y-3">
            <Label>Assistant Type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleChange("assistantType", "voice")}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                  formData.assistantType === "voice"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-border hover:border-blue-300"
                )}
              >
                <Phone className={cn("h-8 w-8", formData.assistantType === "voice" ? "text-blue-500" : "text-muted-foreground")} />
                <span className={cn("font-medium", formData.assistantType === "voice" ? "text-blue-700 dark:text-blue-300" : "")}>
                  Voice Assistant
                </span>
                <span className="text-xs text-muted-foreground text-center">Handle phone calls with AI</span>
              </button>
              <button
                type="button"
                onClick={() => handleChange("assistantType", "chat")}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2",
                  formData.assistantType === "chat"
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                    : "border-border hover:border-green-300"
                )}
              >
                <MessageSquare className={cn("h-8 w-8", formData.assistantType === "chat" ? "text-green-500" : "text-muted-foreground")} />
                <span className={cn("font-medium", formData.assistantType === "chat" ? "text-green-700 dark:text-green-300" : "")}>
                  Chat Assistant
                </span>
                <span className="text-xs text-muted-foreground text-center">Text-based conversations</span>
              </button>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="friendlyName">Assistant Name *</Label>
              <Input
                id="friendlyName"
                placeholder="e.g. Customer Support"
                value={formData.friendlyName}
                onChange={(e) => handleChange("friendlyName", e.target.value)}
              />
            </div>

            {user?.role === "super_admin" && (
              <div className="space-y-2">
                <Label htmlFor="orgId">Organization *</Label>
                {!showNewOrgForm ? (
                  <div className="flex gap-2">
                    <Select value={formData.orgId ?? ""} onValueChange={(v) => handleChange("orgId", v || null)}>
                      <SelectTrigger id="orgId" className="flex-1">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name ?? org.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewOrgForm(true)}
                      title="Create new organization"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Create New Organization</span>
                    </div>
                    <Input
                      placeholder="Organization name"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      disabled={isCreatingOrg}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateOrg}
                        disabled={isCreatingOrg || !newOrgName.trim()}
                        className="flex-1"
                      >
                        {isCreatingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                        Create & Select
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewOrgForm(false);
                          setNewOrgName("");
                        }}
                        disabled={isCreatingOrg}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice-specific settings */}
          {formData.assistantType === "voice" && (
            <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900">
              <h4 className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Mic className="h-4 w-4" /> Voice Settings
              </h4>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Twilio Phone Number *</Label>
                <Input
                  id="phoneNumber"
                  placeholder="+1234567890"
                  value={formData.phoneNumber}
                  onChange={(e) => handleChange("phoneNumber", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Enter a Twilio number from your account. It will be validated automatically.</p>
              </div>

              <div className="space-y-3">
                <Label>ElevenLabs Voice</Label>
                <Tabs value={formData.voiceSelectionMode} onValueChange={(v) => handleChange("voiceSelectionMode", v as "preset" | "custom")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="preset">Preset Voices</TabsTrigger>
                    <TabsTrigger value="custom">Custom Voice ID</TabsTrigger>
                  </TabsList>
                  <TabsContent value="preset" className="mt-3">
                    <Select value={formData.elevenLabsVoiceId} onValueChange={(v) => handleChange("elevenLabsVoiceId", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_VOICES.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TabsContent>
                  <TabsContent value="custom" className="mt-3">
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter ElevenLabs Voice ID (e.g., 21m00Tcm4TlvDq8ikWAM)"
                        value={formData.customVoiceId}
                        onChange={(e) => handleChange("customVoiceId", e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Find voice IDs in your <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">ElevenLabs Voice Library</a>
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-2">
                <Label htmlFor="firstMessage">First Message (Greeting)</Label>
                <Input
                  id="firstMessage"
                  placeholder="Hello, how can I help you today?"
                  value={formData.firstMessage}
                  onChange={(e) => handleChange("firstMessage", e.target.value)}
                />
              </div>

              {/* Background Sound */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="backgroundSound">Background Sound</Label>
                  <Select value={formData.backgroundSound} onValueChange={(v) => handleChange("backgroundSound", v as "none" | "office" | "cafe")}>
                    <SelectTrigger id="backgroundSound">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="office">Office Ambience</SelectItem>
                      <SelectItem value="cafe">Cafe Background</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Adds subtle ambient noise to make calls feel more natural</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backgroundVolume">Background Volume ({Math.round(formData.backgroundVolume * 100)}%)</Label>
                  <Input
                    id="backgroundVolume"
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={formData.backgroundVolume}
                    onChange={(e) => handleChange("backgroundVolume", parseFloat(e.target.value))}
                    className="cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-3 p-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>System Prompt</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex"><HelpCircle className="h-4 w-4 text-muted-foreground" /></button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80">
                    <p>Use the universal prompt from Settings, or define a custom prompt for this assistant.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="useDefaultPrompt" className="text-sm text-muted-foreground">Use Default</Label>
                <Switch
                  id="useDefaultPrompt"
                  checked={formData.useDefaultPrompt}
                  onCheckedChange={(v) => handleChange("useDefaultPrompt", !!v)}
                />
              </div>
            </div>
            {!formData.useDefaultPrompt && (
              <Textarea
                id="prompt"
                placeholder="You are a helpful customer service assistant for..."
                value={formData.prompt}
                onChange={(e) => handleChange("prompt", e.target.value)}
                className="min-h-[120px]"
              />
            )}
            {formData.useDefaultPrompt && (
              <p className="text-sm text-muted-foreground italic">
                Using universal prompt from Settings. Toggle off to customize.
              </p>
            )}
          </div>

          {/* Knowledge Base */}
          <div className="space-y-4 p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-900">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-purple-700 dark:text-purple-300 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Knowledge Base
              </h4>
              <Switch
                checked={formData.kbEnabled}
                onCheckedChange={(v) => handleChange("kbEnabled", !!v)}
              />
            </div>

            {formData.kbEnabled && (
              <div className="space-y-4">
                {/* File Upload */}
                <div className="space-y-2">
                  <Label>Upload Document (TXT, PDF, DOCX)</Label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.pdf,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </Button>
                    {formData.kbFile && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <span className="text-sm text-purple-700 dark:text-purple-300 max-w-[150px] truncate">
                          {formData.kbFile.name}
                        </span>
                        <button type="button" onClick={removeFile} className="text-purple-500 hover:text-purple-700">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Text Input */}
                <div className="space-y-2">
                  <Label>Or Paste Knowledge Text</Label>
                  <Textarea
                    placeholder="Paste FAQ content, product information, or any text the assistant should know..."
                    value={formData.kbText}
                    onChange={(e) => handleChange("kbText", e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Call Transfer - Voice Only */}
          {formData.assistantType === "voice" && (
            <div className="space-y-3 p-4 bg-orange-50/50 dark:bg-orange-950/20 rounded-xl border border-orange-200 dark:border-orange-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-orange-500" />
                  <h4 className="font-medium text-orange-700 dark:text-orange-300">Call Transfer</h4>
                </div>
                <Switch
                  checked={formData.callTransferEnabled}
                  onCheckedChange={(v) => handleChange("callTransferEnabled", !!v)}
                />
              </div>
              {formData.callTransferEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="callTransferNumber">Transfer Number</Label>
                  <Input
                    id="callTransferNumber"
                    placeholder="+61400000000"
                    value={formData.callTransferNumber}
                    onChange={(e) => handleChange("callTransferNumber", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Callers can request to be transferred to this number
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SMS Notifications */}
          <div className="space-y-3 p-4 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-xl border border-cyan-200 dark:border-cyan-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-cyan-500" />
                <h4 className="font-medium text-cyan-700 dark:text-cyan-300">SMS Notifications</h4>
              </div>
              <Switch
                checked={formData.smsEnabled}
                onCheckedChange={(v) => handleChange("smsEnabled", !!v)}
              />
            </div>
            {formData.smsEnabled && (
              <div className="space-y-2">
                <Label htmlFor="smsNotificationNumber">SMS Notification Number</Label>
                <Input
                  id="smsNotificationNumber"
                  placeholder="+61400000000"
                  value={formData.smsNotificationNumber}
                  onChange={(e) => handleChange("smsNotificationNumber", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Send SMS notifications to this number for contact requests
                </p>
              </div>
            )}
          </div>

          {/* Email Notifications */}
          <div className="space-y-3 p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" />
                <h4 className="font-medium text-emerald-700 dark:text-emerald-300">Email Notifications</h4>
              </div>
              <Switch
                checked={formData.emailNotificationsEnabled}
                onCheckedChange={(v) => handleChange("emailNotificationsEnabled", !!v)}
              />
            </div>
            {formData.emailNotificationsEnabled && (
              <div className="space-y-2">
                <Label htmlFor="emailNotificationAddress">Notification Email</Label>
                <Input
                  id="emailNotificationAddress"
                  type="email"
                  placeholder="notifications@example.com"
                  value={formData.emailNotificationAddress}
                  onChange={(e) => handleChange("emailNotificationAddress", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Send email notifications for contact requests (leave empty to use org default)
                </p>
              </div>
            )}
          </div>

          {/* Model Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model">AI Model</Label>
              <Select value={formData.model} onValueChange={(v) => handleChange("model", v)}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast)</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o (Powerful)</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => handleChange("temperature", parseFloat(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                min="100"
                max="4000"
                step="100"
                value={formData.maxTokens}
                onChange={(e) => handleChange("maxTokens", parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Auto-scoring */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="autoScore" className="cursor-pointer">Auto-scoring</Label>
              <p className="text-xs text-muted-foreground">Automatically score conversations using governance rubric</p>
            </div>
            <Switch id="autoScore" checked={formData.autoScore} onCheckedChange={(v) => handleChange("autoScore", !!v)} />
          </div>

          {/* Data Retention Policy */}
          <div className="space-y-3 p-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Label htmlFor="dataRetentionDays">Data Retention Policy</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex"><HelpCircle className="h-4 w-4 text-muted-foreground" /></button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>How long to retain conversation data for this assistant. Set to 0 for indefinite retention.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-3">
              <Input
                id="dataRetentionDays"
                type="number"
                min="0"
                max="365"
                step="1"
                value={formData.dataRetentionDays}
                onChange={(e) => handleChange("dataRetentionDays", parseInt(e.target.value) || 0)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <div className="flex gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChange("dataRetentionDays", 30)}
                  className={formData.dataRetentionDays === 30 ? "border-primary" : ""}
                >
                  30 days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChange("dataRetentionDays", 90)}
                  className={formData.dataRetentionDays === 90 ? "border-primary" : ""}
                >
                  90 days
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleChange("dataRetentionDays", 0)}
                  className={formData.dataRetentionDays === 0 ? "border-primary" : ""}
                >
                  Forever
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.dataRetentionDays === 0
                ? "Conversation data will be retained indefinitely"
                : `Conversation data older than ${formData.dataRetentionDays} days will be automatically deleted`}
            </p>
          </div>

          {/* Pilot Mode - Chat bots only */}
          {formData.assistantType === "chat" && (
            <div className="space-y-4 p-4 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-xl border border-indigo-200 dark:border-indigo-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-indigo-500" />
                  <h4 className="font-medium text-indigo-700 dark:text-indigo-300">Pilot Demo Mode</h4>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="inline-flex"><HelpCircle className="h-4 w-4 text-muted-foreground" /></button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80">
                      <p>Creates a standalone demo page for this chatbot with your client's branding. Perfect for pilot deployments.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  checked={formData.pilotEnabled}
                  onCheckedChange={(v) => handleChange("pilotEnabled", !!v)}
                />
              </div>

              {formData.pilotEnabled && (
                <div className="space-y-4 pt-2">
                  {/* Company Name */}
                  <div className="space-y-2">
                    <Label htmlFor="pilotCompanyName">Client Company Name</Label>
                    <Input
                      id="pilotCompanyName"
                      placeholder="e.g. Moreton Bay Council"
                      value={formData.pilotCompanyName}
                      onChange={(e) => handleChange("pilotCompanyName", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Used in the pilot page header alongside Aspire logo</p>
                  </div>

                  {/* Client Logo Upload */}
                  <div className="space-y-2">
                    <Label>Client Logo (PNG recommended)</Label>
                    <div className="flex items-center gap-3">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoSelect}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        className="flex-1"
                      >
                        <Image className="h-4 w-4 mr-2" />
                        {formData.pilotLogoUrl ? "Change Logo" : "Upload Logo"}
                      </Button>
                      {formData.pilotLogoUrl && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                          <img
                            src={formData.pilotLogoUrl}
                            alt="Client logo preview"
                            className="h-8 max-w-[120px] object-contain"
                          />
                          <button type="button" onClick={removeLogo} className="text-indigo-500 hover:text-indigo-700">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Aspire logo always appears alongside client logo</p>
                  </div>

                  {/* Pilot Greeting */}
                  <div className="space-y-2">
                    <Label htmlFor="pilotGreeting">Pilot Greeting Message</Label>
                    <Textarea
                      id="pilotGreeting"
                      placeholder="Hi — I'm the AI assistant for [Company Name]..."
                      value={formData.pilotGreeting}
                      onChange={(e) => handleChange("pilotGreeting", e.target.value)}
                      className="min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">Defaults to the first message if left empty</p>
                  </div>

                  {/* Test Questions */}
                  <div className="space-y-2">
                    <Label htmlFor="pilotTestQuestions">Sample Test Questions (one per line)</Label>
                    <Textarea
                      id="pilotTestQuestions"
                      placeholder="What are your opening hours?&#10;How do I contact support?&#10;Tell me about your services"
                      value={formData.pilotTestQuestions}
                      onChange={(e) => handleChange("pilotTestQuestions", e.target.value)}
                      className="min-h-[100px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Displayed on the pilot page for testers to try</p>
                  </div>

                  {/* Scope */}
                  <div className="space-y-2">
                    <Label htmlFor="pilotScope">Pilot Scope / Features (one per line)</Label>
                    <Textarea
                      id="pilotScope"
                      placeholder="Informational enquiries&#10;FAQ responses&#10;Contact information"
                      value={formData.pilotScope}
                      onChange={(e) => handleChange("pilotScope", e.target.value)}
                      className="min-h-[80px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Lists what this pilot can do</p>
                  </div>

                  {/* Pilot URL Preview */}
                  {(initialData?.pilot_slug || formData.pilotCompanyName) && (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border">
                      <div className="flex items-center gap-2 text-sm">
                        <Link2 className="h-4 w-4 text-indigo-500" />
                        <span className="text-muted-foreground">Pilot URL:</span>
                        <code className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-indigo-600 dark:text-indigo-400">
                          /pilot/{initialData?.pilot_slug || formData.pilotCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7"
                          onClick={() => {
                            const slug = initialData?.pilot_slug || formData.pilotCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                            navigator.clipboard.writeText(`${window.location.origin}/pilot/${slug}`);
                            toast({ title: "Copied!", description: "Pilot URL copied to clipboard" });
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting || isUploadingKb}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isUploadingKb}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isSubmitting || isUploadingKb ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isUploadingKb ? "Uploading KB..." : "Saving..."}
                </>
              ) : (
                initialData?.id ? "Save Changes" : "Create Assistant"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddAssistantModal;
