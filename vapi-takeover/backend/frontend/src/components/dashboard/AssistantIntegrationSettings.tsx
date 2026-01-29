// AssistantIntegrationSettings.tsx
// Component for configuring integration settings on individual assistants
// Supports cascading: Assistant-specific → Organization defaults → None

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plug,
  Building2,
  Database,
  Phone,
  Users,
  FileText,
  BookOpen,
  Upload,
  Download,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Info,
  Loader2,
  Save,
  Settings,
  Zap,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Types
interface Integration {
  id: string;
  name: string;
  provider: string;
  direction: string;
  status: string;
  use_case: string;
  assistant_id?: string;
}

interface IntegrationSettings {
  enabledIntegrations: string[];
  kbImportIntegrationId: string | null;
  callLoggingIntegrationId: string | null;
  jobLoggingIntegrationId: string | null;
  ticketCreationIntegrationId: string | null;
  contactSyncIntegrationId: string | null;
  useOrgDefaults: boolean;
  overrideOrgSettings: boolean;
}

interface Props {
  assistantId: string;
  orgId: string;
  integrationsEnabled: boolean;
  integrationSettings: IntegrationSettings | null;
  onUpdate: (enabled: boolean, settings: IntegrationSettings) => void;
  compact?: boolean;
}

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

const USE_CASE_CONFIG: Record<string, { label: string; description: string; icon: typeof Database }> = {
  kb_import: {
    label: "Knowledge Base Import",
    description: "Pull KB content from external system",
    icon: BookOpen,
  },
  call_logging: {
    label: "Call Logging",
    description: "Log call details to contact center",
    icon: Phone,
  },
  job_logging: {
    label: "Job/Work Order Logging",
    description: "Create jobs in CRM when issues reported",
    icon: FileText,
  },
  ticket_creation: {
    label: "Support Ticket Creation",
    description: "Create support tickets from conversations",
    icon: FileText,
  },
  contact_sync: {
    label: "Contact Synchronization",
    description: "Sync contact info with CRM",
    icon: Users,
  },
};

const DEFAULT_SETTINGS: IntegrationSettings = {
  enabledIntegrations: [],
  kbImportIntegrationId: null,
  callLoggingIntegrationId: null,
  jobLoggingIntegrationId: null,
  ticketCreationIntegrationId: null,
  contactSyncIntegrationId: null,
  useOrgDefaults: true,
  overrideOrgSettings: false,
};

export function AssistantIntegrationSettings({
  assistantId,
  orgId,
  integrationsEnabled,
  integrationSettings,
  onUpdate,
  compact = false,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(integrationsEnabled);
  const [settings, setSettings] = useState<IntegrationSettings>(
    integrationSettings || DEFAULT_SETTINGS
  );
  const [orgIntegrations, setOrgIntegrations] = useState<Integration[]>([]);
  const [assistantIntegrations, setAssistantIntegrations] = useState<Integration[]>([]);

  // Fetch available integrations
  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch org-wide integrations
      const res = await fetch(`${API_BASE}/api/integrations/org/${orgId}`);
      const data = await res.json();

      if (data.success) {
        // Separate org-wide vs assistant-specific
        const orgWide = data.integrations.filter(
          (i: Integration) => !i.assistant_id && i.status === "active"
        );
        const assistantSpecific = data.integrations.filter(
          (i: Integration) => i.assistant_id === assistantId && i.status === "active"
        );

        setOrgIntegrations(orgWide);
        setAssistantIntegrations(assistantSpecific);
      }
    } catch (error) {
      console.error("Error fetching integrations:", error);
    } finally {
      setLoading(false);
    }
  }, [orgId, assistantId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Get integrations by use case
  const getIntegrationsByUseCase = (useCase: string) => {
    const all = [...assistantIntegrations, ...orgIntegrations];
    return all.filter((i) => i.use_case === useCase || i.use_case === "general");
  };

  // Handle toggle
  const handleToggle = async (value: boolean) => {
    setEnabled(value);
    onUpdate(value, settings);
  };

  // Handle settings change
  const handleSettingsChange = (key: keyof IntegrationSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onUpdate(enabled, newSettings);
  };

  // Handle use case integration selection
  const handleUseCaseIntegration = (useCase: string, integrationId: string | null) => {
    const settingKey = `${useCase.replace("_", "")}IntegrationId` as keyof IntegrationSettings;

    // Map use case to actual setting key
    const keyMap: Record<string, keyof IntegrationSettings> = {
      kb_import: "kbImportIntegrationId",
      call_logging: "callLoggingIntegrationId",
      job_logging: "jobLoggingIntegrationId",
      ticket_creation: "ticketCreationIntegrationId",
      contact_sync: "contactSyncIntegrationId",
    };

    const actualKey = keyMap[useCase];
    if (actualKey) {
      handleSettingsChange(actualKey, integrationId === "org-default" ? null : integrationId);
    }
  };

  // Get current selection for use case
  const getUseCaseSelection = (useCase: string): string => {
    const keyMap: Record<string, keyof IntegrationSettings> = {
      kb_import: "kbImportIntegrationId",
      call_logging: "callLoggingIntegrationId",
      job_logging: "jobLoggingIntegrationId",
      ticket_creation: "ticketCreationIntegrationId",
      contact_sync: "contactSyncIntegrationId",
    };

    const key = keyMap[useCase];
    const value = key ? settings[key] : null;
    return (value as string) || "org-default";
  };

  // Get effective integration for display
  const getEffectiveIntegration = (useCase: string): Integration | null => {
    const keyMap: Record<string, keyof IntegrationSettings> = {
      kb_import: "kbImportIntegrationId",
      call_logging: "callLoggingIntegrationId",
      job_logging: "jobLoggingIntegrationId",
      ticket_creation: "ticketCreationIntegrationId",
      contact_sync: "contactSyncIntegrationId",
    };

    const key = keyMap[useCase];
    const selectedId = key ? settings[key] : null;

    // If specific integration selected, use it
    if (selectedId) {
      const all = [...assistantIntegrations, ...orgIntegrations];
      return all.find((i) => i.id === selectedId) || null;
    }

    // If using org defaults, find org default for this use case
    if (settings.useOrgDefaults) {
      return orgIntegrations.find((i) => i.use_case === useCase) || null;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allIntegrations = [...assistantIntegrations, ...orgIntegrations];
  const hasAnyIntegrations = allIntegrations.length > 0;

  // Compact mode for sidebar or settings panel
  if (compact) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4" />
            <span className="font-medium">CRM Integrations</span>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {enabled && (
          <div className="space-y-2 text-sm">
            {!hasAnyIntegrations ? (
              <p className="text-muted-foreground">
                No integrations configured.{" "}
                <a href="/integrations" className="text-primary hover:underline">
                  Add one
                </a>
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={settings.useOrgDefaults}
                    onCheckedChange={(v) => handleSettingsChange("useOrgDefaults", v)}
                    className="scale-75"
                  />
                  <span className="text-muted-foreground">Use organization defaults</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {allIntegrations.slice(0, 3).map((integration) => {
                    const config = PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                    return (
                      <Badge key={integration.id} variant="outline" className="text-xs">
                        {integration.name}
                      </Badge>
                    );
                  })}
                  {allIntegrations.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{allIntegrations.length - 3} more
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full settings panel
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            <CardTitle>Integration Settings</CardTitle>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>
        <CardDescription>
          Configure how this assistant connects to external CRMs and APIs
        </CardDescription>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-6">
          {!hasAnyIntegrations ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Plug className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">
                No integrations configured for your organization
              </p>
              <Button variant="outline" asChild>
                <a href="/integrations">
                  <Settings className="w-4 h-4 mr-2" />
                  Configure Integrations
                </a>
              </Button>
            </div>
          ) : (
            <>
              {/* Fallback behavior */}
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Use Organization Defaults</Label>
                    <p className="text-xs text-muted-foreground">
                      Fall back to org-wide integrations when no specific selection
                    </p>
                  </div>
                  <Switch
                    checked={settings.useOrgDefaults}
                    onCheckedChange={(v) => handleSettingsChange("useOrgDefaults", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">Override Org Settings</Label>
                    <p className="text-xs text-muted-foreground">
                      Only use assistant-specific integrations, ignore org defaults
                    </p>
                  </div>
                  <Switch
                    checked={settings.overrideOrgSettings}
                    onCheckedChange={(v) => handleSettingsChange("overrideOrgSettings", v)}
                  />
                </div>
              </div>

              {/* Use case assignments */}
              <Accordion type="single" collapsible className="w-full">
                {Object.entries(USE_CASE_CONFIG).map(([useCase, config]) => {
                  const available = getIntegrationsByUseCase(useCase);
                  const effective = getEffectiveIntegration(useCase);
                  const UseCaseIcon = config.icon;

                  return (
                    <AccordionItem key={useCase} value={useCase}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <UseCaseIcon className="w-4 h-4" />
                          <span>{config.label}</span>
                          {effective ? (
                            <Badge variant="secondary" className="ml-2">
                              {effective.name}
                            </Badge>
                          ) : available.length > 0 ? (
                            <Badge variant="outline" className="ml-2 text-muted-foreground">
                              Using org default
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="ml-2 text-muted-foreground">
                              Not configured
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pt-2">
                          <p className="text-sm text-muted-foreground">{config.description}</p>

                          {available.length === 0 ? (
                            <p className="text-sm text-amber-600 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              No integrations available for this use case
                            </p>
                          ) : (
                            <Select
                              value={getUseCaseSelection(useCase)}
                              onValueChange={(v) =>
                                handleUseCaseIntegration(useCase, v === "org-default" ? null : v)
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select integration..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="org-default">
                                  <div className="flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" />
                                    Use organization default
                                  </div>
                                </SelectItem>
                                {available.map((integration) => {
                                  const providerConfig =
                                    PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                                  const ProviderIcon = providerConfig.icon;
                                  const isAssistantSpecific = integration.assistant_id === assistantId;

                                  return (
                                    <SelectItem key={integration.id} value={integration.id}>
                                      <div className="flex items-center gap-2">
                                        <ProviderIcon className="w-3 h-3" />
                                        {integration.name}
                                        {isAssistantSpecific && (
                                          <Badge variant="secondary" className="text-xs ml-1">
                                            This agent
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          )}

                          {/* Show effective integration details */}
                          {effective && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 bg-muted rounded">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              Will use:{" "}
                              <span className="font-medium">{effective.name}</span>
                              {effective.assistant_id === assistantId
                                ? " (assistant-specific)"
                                : " (org default)"}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {/* Summary of active integrations */}
              <div className="pt-4 border-t">
                <Label className="text-sm font-medium mb-2 block">
                  Active Integrations for This Agent
                </Label>
                <div className="flex flex-wrap gap-2">
                  {assistantIntegrations.length > 0 ? (
                    assistantIntegrations.map((integration) => {
                      const config =
                        PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                      const ProviderIcon = config.icon;

                      return (
                        <TooltipProvider key={integration.id}>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="default" className="flex items-center gap-1">
                                <ProviderIcon className="w-3 h-3" />
                                {integration.name}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {integration.provider} - {integration.use_case}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {integration.direction}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      No assistant-specific integrations
                    </span>
                  )}
                </div>

                {settings.useOrgDefaults && orgIntegrations.length > 0 && (
                  <>
                    <Label className="text-sm font-medium mb-2 block mt-4">
                      Organization Defaults (Fallback)
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {orgIntegrations.map((integration) => {
                        const config =
                          PROVIDER_CONFIG[integration.provider] || PROVIDER_CONFIG.custom;
                        const ProviderIcon = config.icon;

                        return (
                          <Badge
                            key={integration.id}
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <ProviderIcon className="w-3 h-3" />
                            {integration.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Info about workflow */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-700">How it works:</p>
                  <p className="text-blue-600">
                    When events occur (e.g., call ends), the system checks for integrations in this
                    order:
                  </p>
                  <ol className="list-decimal list-inside text-blue-600 mt-1">
                    <li>Assistant-specific integration for the use case</li>
                    <li>
                      Organization default for the use case (if "Use org defaults" is enabled)
                    </li>
                  </ol>
                  <p className="text-blue-600 mt-1">
                    Multiple integrations can fire for the same event based on their configured
                    triggers.
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default AssistantIntegrationSettings;
