import { useState, useEffect } from "react";
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
import { HelpCircle, Phone, MessageSquare, Mic } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createAssistant, updateAssistant, AssistantRow } from "@/services/assistantService";
import { useUser } from "@/context/UserContext";
import { fetchOrganizations } from "@/services/organizationService";
import { cn } from "@/lib/utils";

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
  elevenLabsVoiceId: string;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  firstMessage: string;
  kbEnabled: boolean;
  orgId?: string | null;
  autoScore: boolean;
}

const DEFAULT_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Female)" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi (Female)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella (Female)" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (Male)" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli (Female)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (Male)" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold (Male)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (Male)" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam (Male)" },
];

export function AddAssistantModal({ open, onOpenChange, initialData, onSuccess }: AddAssistantModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();
  const [organizations, setOrganizations] = useState<{ id: string; name?: string | null }[]>([]);

  const [formData, setFormData] = useState<FormData>({
    friendlyName: "",
    assistantType: "voice",
    phoneNumber: "",
    elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    prompt: "",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1000,
    firstMessage: "Hello, how can I help you today?",
    kbEnabled: false,
    orgId: null,
    autoScore: true,
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

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (initialData) {
        setFormData({
          friendlyName: initialData.friendly_name ?? "",
          assistantType: (initialData.assistant_type as "voice" | "chat") ?? "voice",
          phoneNumber: initialData.phone_number ?? "",
          elevenLabsVoiceId: initialData.elevenlabs_voice_id ?? "21m00Tcm4TlvDq8ikWAM",
          prompt: initialData.prompt ?? "",
          model: initialData.model ?? "gpt-4o-mini",
          temperature: initialData.temperature ?? 0.7,
          maxTokens: initialData.max_tokens ?? 1000,
          firstMessage: initialData.first_message ?? "Hello, how can I help you today?",
          kbEnabled: initialData.kb_enabled ?? false,
          orgId: initialData.org_id ?? null,
          autoScore: initialData.auto_score ?? true,
        });
      } else {
        // Reset to defaults for new assistant
        setFormData({
          friendlyName: "",
          assistantType: "voice",
          phoneNumber: "",
          elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
          prompt: "",
          model: "gpt-4o-mini",
          temperature: 0.7,
          maxTokens: 1000,
          firstMessage: "Hello, how can I help you today?",
          kbEnabled: false,
          orgId: user?.role === "org_admin" ? user?.org_id ?? null : null,
          autoScore: true,
        });
      }
    }
  }, [initialData, open, user]);

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        elevenlabs_voice_id: formData.assistantType === "voice" ? formData.elevenLabsVoiceId : null,
        prompt: formData.prompt || null,
        model: formData.model,
        temperature: formData.temperature,
        max_tokens: formData.maxTokens,
        first_message: formData.firstMessage || null,
        kb_enabled: formData.kbEnabled,
        auto_score: formData.autoScore,
      };

      let result;
      if (initialData?.id) {
        result = await updateAssistant(initialData.id, payload);
      } else {
        result = await createAssistant(payload);
      }

      if (result.success) {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                <Select value={formData.orgId ?? ""} onValueChange={(v) => handleChange("orgId", v || null)}>
                  <SelectTrigger id="orgId">
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
              </div>
            )}
          </div>

          {/* Voice-specific settings */}
          {formData.assistantType === "voice" && (
            <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900">
              <h4 className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Mic className="h-4 w-4" /> Voice Settings
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Twilio Phone Number *</Label>
                  <Input
                    id="phoneNumber"
                    placeholder="+1234567890"
                    value={formData.phoneNumber}
                    onChange={(e) => handleChange("phoneNumber", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Must be a verified Twilio number</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice">ElevenLabs Voice</Label>
                  <Select value={formData.elevenLabsVoiceId} onValueChange={(v) => handleChange("elevenLabsVoiceId", v)}>
                    <SelectTrigger id="voice">
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
                </div>
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
                  <p>Instructions that define how the assistant behaves, its personality, and what information it should provide.</p>
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

          {/* Feature Toggles */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <Label htmlFor="kbEnabled" className="cursor-pointer">Knowledge Base</Label>
              <Switch id="kbEnabled" checked={formData.kbEnabled} onCheckedChange={(v) => handleChange("kbEnabled", !!v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <Label htmlFor="autoScore" className="cursor-pointer">Auto-scoring</Label>
              <Switch id="autoScore" checked={formData.autoScore} onCheckedChange={(v) => handleChange("autoScore", !!v)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isSubmitting ? "Saving..." : initialData?.id ? "Save Changes" : "Create Assistant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddAssistantModal;
