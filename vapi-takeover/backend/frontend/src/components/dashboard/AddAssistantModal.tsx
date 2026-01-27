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
import { HelpCircle, Phone, MessageSquare, Mic, Upload, FileText, X, Loader2, Plus, Building2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createAssistant, updateAssistant, AssistantRow } from "@/services/assistantService";
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
        prompt: formData.prompt || null,
        model: formData.model,
        temperature: formData.temperature,
        max_tokens: formData.maxTokens,
        first_message: formData.firstMessage || null,
        kb_enabled: formData.kbEnabled,
        auto_score: formData.autoScore,
        background_sound: formData.assistantType === "voice" ? formData.backgroundSound : null,
        background_volume: formData.assistantType === "voice" ? formData.backgroundVolume : null,
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

        toast({
          title: initialData?.id ? "Assistant Updated" : "Assistant Created",
          description: `${formData.friendlyName} has been ${initialData?.id ? "updated" : "created"} successfully.`
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
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="prompt">System Prompt</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex"><HelpCircle className="h-4 w-4 text-muted-foreground" /></button>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>Instructions that define how the assistant behaves. This is combined with the universal prompt.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              id="prompt"
              placeholder="You are a helpful customer service assistant for..."
              value={formData.prompt}
              onChange={(e) => handleChange("prompt", e.target.value)}
              className="min-h-[120px]"
            />
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
