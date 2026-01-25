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
import { HelpCircle } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createAssistant, updateAssistant, AssistantRow } from "@/services/assistantService";
import { useUser } from "@/context/UserContext";
import { fetchOrganizations } from "@/services/organizationService";

interface AddAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: AssistantRow | null;
  onSuccess?: () => void;
}

type KBType = "Link" | "Text" | "PDF";

interface FormData {
  provider: string;
  apiKey: string;
  friendlyName: string;
  prompt: string;
  kbType: KBType;
  kbUrl: string;
  kbText: string;
  kbFile: File | null;
  orgId?: string | null;
  defaultRubric: string;
  transcriptSource: string;
  autoScore: boolean;
}

export function AddAssistantModal({ open, onOpenChange, initialData, onSuccess }: AddAssistantModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState<FormData>({
    provider: "vapi",
    apiKey: "",
    friendlyName: "",
    prompt: "",
    kbType: "Link",
    kbUrl: "",
    kbText: "",
    kbFile: null,
    orgId: null,
    defaultRubric: "",
    transcriptSource: "provider",
    autoScore: true,
  });

  const { user } = useUser();
  const [organizations, setOrganizations] = useState<{ id: string; name?: string | null }[]>([]);

  // fetch organizations only if super_admin
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
    return () => {
      mounted = false;
    };
  }, [user]);

  // if current user is org_admin, pre-fill orgId
  useEffect(() => {
    if (user?.role === "org_admin") {
      const orgId = (user as { org_id?: string | null }).org_id ?? null;
      setFormData((prev) => ({ ...prev, orgId }));
    }
  }, [user]);

  // If editing, populate form from initialData; otherwise reset to defaults
  useEffect(() => {
    if (open) {
      if (initialData) {
        // Editing mode - populate with existing data
        setFormData((_) => ({
          provider: (initialData.provider ?? "vapi").toString(),
          apiKey: initialData.assistant_key ?? "",
          friendlyName: initialData.friendly_name ?? "",
          prompt: initialData.prompt ?? "",
          kbType: "Link",
          kbUrl: initialData.kb_path ?? "",
          orgId: initialData.org_id ?? null,
          kbText: "",
          kbFile: null,
          defaultRubric: initialData.rubric ?? "",
          transcriptSource: initialData.transcript_source ?? "provider",
          autoScore: initialData.auto_score ?? true,
        }));
      } else {
        // Adding new assistant - reset to defaults
        setFormData({
          provider: "vapi",
          apiKey: "",
          friendlyName: "",
          prompt: "",
          kbType: "Link",
          kbUrl: "",
          kbText: "",
          kbFile: null,
          orgId: user?.role === "org_admin" ? (user as { org_id?: string | null }).org_id ?? null : null,
          defaultRubric: "",
          transcriptSource: "provider",
          autoScore: true,
        });
      }
    }
  }, [initialData, open, user]);

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => {
      // When kbType changes, clear other kb fields
      if (field === "kbType") {
        return {
          ...prev,
          kbType: value as KBType,
          kbUrl: "",
          kbText: "",
          kbFile: null,
        };
      }

      return { ...prev, [field]: value } as FormData;
    });
  };

  const handleFileChange = (file: File | null) => {
    handleChange("kbFile", file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Build payload and call service
    (async () => {
      try {
        // Map formData to service input
        const input = {
          provider: formData.provider,
          apiKey: formData.apiKey || null,
          friendlyName: formData.friendlyName || null,
          prompt: formData.prompt || null,
          kbType: formData.kbType,
          kbUrl: formData.kbUrl || null,
          kbText: formData.kbText || null,
          kbFile: formData.kbFile || null,
          defaultRubric: formData.defaultRubric || null,
          transcriptSource: formData.transcriptSource || null,
          autoScore: formData.autoScore,
          orgId: user?.role === "org_admin" ? (user?.org_id ?? null) : formData.orgId ?? null,
        };
        let result;
        if (initialData?.id) {
          result = await updateAssistant(initialData.id, input);
        } else {
          result = await createAssistant(input);
        }

        if (result.success) {
          toast({ title: initialData?.id ? "Assistant updated" : "Assistant created", description: "Saved successfully." });
          // reset form to defaults
          setFormData({
            provider: "vapi",
            apiKey: "",
            friendlyName: "",
            prompt: "",
            kbType: "Link",
            kbUrl: "",
            kbText: "",
            kbFile: null,
            orgId: user?.role === "org_admin" ? (user as { org_id?: string | null }).org_id ?? null : null,
            defaultRubric: "",
            transcriptSource: "provider",
            autoScore: true,
          });

          setIsSubmitting(false);
          onOpenChange(false);
          onSuccess?.();
        } else {
          console.error(result.error);
          
          // Check for duplicate key error
          let errorMessage = String(result.error);
          if (typeof result.error === 'object' && result.error !== null) {
            const error = result.error as any;
            if (error.code === '23505' || error.message?.includes('duplicate key')) {
              errorMessage = 'This Assistant Key already exists. Please use a different API key.';
            } else if (error.message) {
              errorMessage = error.message;
            }
          }
          
          toast({ 
            title: "Error", 
            description: errorMessage, 
            variant: "destructive" 
          });
          setIsSubmitting(false);
        }
      } catch (err) {
        console.error(err);
        
        // Handle duplicate key error in catch block as well
        let errorMessage = "Unexpected error";
        if (typeof err === 'object' && err !== null) {
          const error = err as any;
          if (error.code === '23505' || error.message?.includes('duplicate key')) {
            errorMessage = 'This Assistant Key already exists. Please use a different API key.';
          } else if (error.message) {
            errorMessage = error.message;
          }
        }
        
        toast({ 
          title: "Error", 
          description: errorMessage, 
          variant: "destructive" 
        });
        setIsSubmitting(false);
      }
    })();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialData?.id ? "Edit Assistant" : "Add Assistant"}</DialogTitle>
          <DialogDescription>Provide connection and configuration details for the assistant.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={formData.provider} onValueChange={(v) => handleChange("provider", v)}>
                <SelectTrigger id="provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghl">GHL</SelectItem>
                  <SelectItem value="vapi">Vapi</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Organization selector for super_admin */}
            {user?.role === "super_admin" && (
              <div className="space-y-2">
                <Label htmlFor="orgId">Organization</Label>
                <Select value={formData.orgId ?? ""} onValueChange={(v) => handleChange("orgId", v || null)}>
                  <SelectTrigger id="orgId" className="w-full">
                    <SelectValue />
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

            <div className={user?.role === "super_admin" ? "space-y-2 col-span-2" : "space-y-2"}>
              <div className="flex items-center gap-2">
                <Label htmlFor="apiKey">Assistant ID</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center"
                      onClick={(e) => e.preventDefault()}
                    >
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-56">
                    <p>It must match the VAPI or GHL assistant id; otherwise conversations will not be fetched.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="apiKey"
                placeholder="Paste assistant ID"
                value={formData.apiKey}
                onChange={(e) => handleChange("apiKey", e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="friendlyName">Friendly name</Label>
            <Input
              id="friendlyName"
              placeholder="e.g. Sales Assistant"
              value={formData.friendlyName}
              onChange={(e) => handleChange("friendlyName", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Paste prompt</Label>
            <Textarea
              id="prompt"
              placeholder="System prompt or instructions for the assistant"
              value={formData.prompt}
              onChange={(e) => handleChange("prompt", e.target.value)}
            />
          </div>

          {/* KB Upload Type */}
          <div className="space-y-2">
            <Label htmlFor="kbType">KB Upload Type</Label>
            <Select value={formData.kbType} onValueChange={(v) => handleChange("kbType", v as KBType)}>
              <SelectTrigger id="kbType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Link">Link</SelectItem>
                <SelectItem value="Text">Text</SelectItem>
                <SelectItem value="PDF">PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional KB input depending on kbType */}
          <div className="space-y-2">
            <Label htmlFor="kbInput">Optional KB upload</Label>
            {formData.kbType === "Link" && (
              <Input
                id="kbUrl"
                placeholder="https://... or leave blank"
                value={formData.kbUrl}
                onChange={(e) => handleChange("kbUrl", e.target.value)}
              />
            )}

            {formData.kbType === "Text" && (
              <Textarea
                id="kbText"
                placeholder="Paste KB text here"
                value={formData.kbText}
                onChange={(e) => handleChange("kbText", e.target.value)}
              />
            )}

            {formData.kbType === "PDF" && (
              <div>
                <input
                  id="kbFile"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFileChange(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                  className="file-input block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
                />
                {formData.kbFile && (
                  <p className="text-sm text-muted-foreground mt-2">Selected file: {formData.kbFile.name}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultRubric">Default rubric</Label>
            <Textarea
              id="defaultRubric"
              placeholder="Optional scoring rubric"
              value={formData.defaultRubric}
              onChange={(e) => handleChange("defaultRubric", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="transcriptSource">Transcript source</Label>
              <Select value={formData.transcriptSource} onValueChange={(v) => handleChange("transcriptSource", v)}>
                <SelectTrigger id="transcriptSource" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="provider">Provider</SelectItem>
                  <SelectItem value="asr">ASR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <Label htmlFor="autoScore" className="cursor-pointer">Auto-score enabled</Label>
              <Switch id="autoScore" checked={formData.autoScore} onCheckedChange={(v) => handleChange("autoScore", !!v)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="bg-gradient-primary hover:opacity-90" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : initialData?.id ? "Save Changes" : "Add Assistant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddAssistantModal;
