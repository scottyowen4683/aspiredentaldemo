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
  Settings as SettingsIcon,
  FileText,
  Shield,
  Bell,
  Database,
  RefreshCw,
  Save,
  AlertTriangle,
  CheckCircle,
  History,
  Copy,
} from "lucide-react";
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
import { createDefaultRubric, Rubric, validateRubric } from "@/services/rubricService";

interface SystemSettings {
  id?: string;
  universal_system_prompt: string;
  default_model: string;
  default_temperature: number;
  default_max_tokens: number;
  auto_score_enabled: boolean;
  welcome_email_enabled: boolean;
  monthly_report_enabled: boolean;
  default_rubric: Rubric | null;
  updated_at?: string;
  updated_by?: string;
}

interface SettingsHistory {
  id: string;
  setting_name: string;
  old_value: string;
  new_value: string;
  changed_by: string;
  changed_at: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  universal_system_prompt: `You are a helpful, friendly AI assistant.

RESPONSE STYLE:
- Be warm, professional, and helpful at all times
- Start responses with brief acknowledgments like "Sure," or "Of course," or "Let me check that."
- Keep responses clear and conversational
- For voice calls: keep responses brief (under 50 words)
- For chat: provide thorough, well-structured answers

CORE INSTRUCTIONS:
1. Use ONLY the knowledge base information provided to answer questions - this is your PRIMARY source of truth
2. If the knowledge base contains the answer, use it confidently and accurately
3. If information is NOT in the knowledge base, say: "I don't have that specific information in my records. Would you like me to help connect you with someone who can assist?"
4. NEVER make up or hallucinate information - accuracy is critical
5. Maintain confidentiality of customer information

CAPTURING REQUESTS:
When a user wants to lodge a complaint, report an issue, or be contacted:
1. Ask for their name and contact details (phone/email)
2. Confirm the address related to the issue (if applicable)
3. Get full details of their request
4. The system will automatically capture and email the request

ENDING CONVERSATIONS:
When the user says goodbye, thanks, that's all, or similar:
- Say a brief friendly goodbye
- For voice: include the word "goodbye" to signal call end`,
  default_model: "gpt-4o-mini",
  default_temperature: 0.7,
  default_max_tokens: 2048,
  auto_score_enabled: true,
  welcome_email_enabled: true,
  monthly_report_enabled: true,
  default_rubric: null,
};

export default function Settings() {
  const { user } = useUser();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<SettingsHistory[]>([]);
  const [activeTab, setActiveTab] = useState("prompts");

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);

      // Try to fetch from system_settings table (get the first/only row)
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 is "no rows returned" - that's ok, we use defaults
        console.error("Error fetching settings:", error);
      }

      if (data) {
        setSettings({
          id: data.id,
          universal_system_prompt: data.universal_system_prompt || DEFAULT_SETTINGS.universal_system_prompt,
          default_model: data.default_model || DEFAULT_SETTINGS.default_model,
          default_temperature: data.default_temperature ?? DEFAULT_SETTINGS.default_temperature,
          default_max_tokens: data.default_max_tokens ?? DEFAULT_SETTINGS.default_max_tokens,
          auto_score_enabled: data.auto_score_enabled ?? DEFAULT_SETTINGS.auto_score_enabled,
          welcome_email_enabled: data.welcome_email_enabled ?? DEFAULT_SETTINGS.welcome_email_enabled,
          monthly_report_enabled: data.monthly_report_enabled ?? DEFAULT_SETTINGS.monthly_report_enabled,
          default_rubric: data.default_rubric ? JSON.parse(data.default_rubric) : null,
          updated_at: data.updated_at,
          updated_by: data.updated_by,
        });
      }

      // Fetch settings history
      const { data: historyData } = await supabase
        .from("settings_history")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(20);

      if (historyData) {
        setHistory(historyData);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const settingsData = {
        universal_system_prompt: settings.universal_system_prompt,
        default_model: settings.default_model,
        default_temperature: settings.default_temperature,
        default_max_tokens: settings.default_max_tokens,
        auto_score_enabled: settings.auto_score_enabled,
        welcome_email_enabled: settings.welcome_email_enabled,
        monthly_report_enabled: settings.monthly_report_enabled,
        default_rubric: settings.default_rubric ? JSON.stringify(settings.default_rubric) : null,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      };

      if (settings.id) {
        // Update existing row
        const { error } = await supabase
          .from("system_settings")
          .update(settingsData)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new row (Supabase will generate UUID)
        const { data, error } = await supabase
          .from("system_settings")
          .insert([settingsData])
          .select()
          .single();

        if (error) throw error;
        setSettings({ ...settings, id: data.id });
      }

      toast({
        title: "Settings Saved",
        description: "System settings have been updated successfully.",
      });

      fetchSettings();
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. The settings table may not exist yet.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(settings.universal_system_prompt);
      toast({
        title: "Copied",
        description: "System prompt copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleResetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to defaults? This cannot be undone.")) {
      setSettings(DEFAULT_SETTINGS);
      toast({
        title: "Reset",
        description: "Settings reset to defaults. Click Save to apply changes.",
      });
    }
  };

  const handleInitializeDefaultRubric = () => {
    const defaultRubric = createDefaultRubric();
    setSettings({ ...settings, default_rubric: defaultRubric });
    toast({
      title: "Rubric Initialized",
      description: "Default governance rubric has been loaded. Customize and save.",
    });
  };

  if (user?.role !== "super_admin") {
    return (
      <DashboardLayout userRole={user?.role as "super_admin" | "org_admin"}>
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
              <p className="text-muted-foreground">
                System settings are only accessible to super administrators.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={user?.role as "super_admin" | "org_admin"}>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">System Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure platform-wide settings and defaults
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleResetToDefaults}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Last Updated Info */}
        {settings.updated_at && (
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <History className="h-4 w-4" />
                <span>
                  Last updated: {new Date(settings.updated_at).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="prompts">
              <FileText className="h-4 w-4 mr-2" />
              Universal Prompt
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Database className="h-4 w-4 mr-2" />
              AI Defaults
            </TabsTrigger>
            <TabsTrigger value="governance">
              <Shield className="h-4 w-4 mr-2" />
              Governance
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Universal Prompt Tab */}
          <TabsContent value="prompts" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Universal System Prompt</span>
                  <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </CardTitle>
                <CardDescription>
                  <strong className="text-foreground">This prompt is used by ALL assistants that have "Use Default Prompt" enabled.</strong>{" "}
                  When you edit this prompt, it immediately changes the behavior of all assistants using the default.
                  Use it to set global behavior guidelines, compliance requirements, and brand voice.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={settings.universal_system_prompt}
                  onChange={(e) =>
                    setSettings({ ...settings, universal_system_prompt: e.target.value })
                  }
                  rows={15}
                  className="font-mono text-sm"
                  placeholder="Enter the universal system prompt..."
                />
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{settings.universal_system_prompt.length} characters</span>
                  <span>~{Math.ceil(settings.universal_system_prompt.length / 4)} tokens</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prompt Best Practices</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Include clear instructions about tone and professionalism</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Define compliance and privacy requirements</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Specify escalation procedures for complex issues</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <span>Include brand guidelines and vocabulary preferences</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <span>Keep prompt concise - longer prompts use more tokens per call</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Defaults Tab */}
          <TabsContent value="ai" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Default AI Configuration</CardTitle>
                <CardDescription>
                  Set default values for new assistants. These can be overridden per assistant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Default Model</Label>
                    <Select
                      value={settings.default_model}
                      onValueChange={(value) =>
                        setSettings({ ...settings, default_model: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o-mini">GPT-4o Mini (Fast & Efficient)</SelectItem>
                        <SelectItem value="gpt-4o">GPT-4o (Balanced)</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo (Premium)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Recommended: gpt-4o-mini for most use cases
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Temperature ({settings.default_temperature})</Label>
                    <Input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.default_temperature}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          default_temperature: parseFloat(e.target.value),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower = more focused, Higher = more creative
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Max Tokens</Label>
                    <Input
                      type="number"
                      value={settings.default_max_tokens}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          default_max_tokens: parseInt(e.target.value) || 2048,
                        })
                      }
                      min={256}
                      max={4096}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum response length (256-4096)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Auto-Scoring</Label>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Automatically score conversations
                      </span>
                      <Switch
                        checked={settings.auto_score_enabled}
                        onCheckedChange={(checked) =>
                          setSettings({ ...settings, auto_score_enabled: checked })
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Governance Tab */}
          <TabsContent value="governance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Default Governance Rubric</CardTitle>
                <CardDescription>
                  Define the default scoring rubric for conversation quality assessment.
                  Organizations can override this with their own rubric.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {settings.default_rubric ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">
                        Version {settings.default_rubric.version}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettings({ ...settings, default_rubric: null })}
                      >
                        Clear Rubric
                      </Button>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Dimension</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>Criteria</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settings.default_rubric.dimensions.map((dim, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{dim.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{dim.weight}%</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {dim.criteria}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="font-medium mb-2">Scoring Scale</h4>
                      <div className="grid grid-cols-5 gap-2 text-sm">
                        <div className="text-center">
                          <div className="font-medium text-green-600">Excellent</div>
                          <div>{settings.default_rubric.scoring_scale.excellent}+</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-blue-600">Good</div>
                          <div>{settings.default_rubric.scoring_scale.good}+</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-yellow-600">Satisfactory</div>
                          <div>{settings.default_rubric.scoring_scale.satisfactory}+</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-orange-600">Needs Improvement</div>
                          <div>{settings.default_rubric.scoring_scale.needs_improvement}+</div>
                        </div>
                        <div className="text-center">
                          <div className="font-medium text-red-600">Poor</div>
                          <div>&lt;{settings.default_rubric.scoring_scale.needs_improvement}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Default Rubric Set</h3>
                    <p className="text-muted-foreground mb-4">
                      Initialize a default governance rubric for conversation scoring
                    </p>
                    <Button onClick={handleInitializeDefaultRubric}>
                      Initialize Default Rubric
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Configure automated email notifications for the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Welcome Emails</h4>
                      <p className="text-sm text-muted-foreground">
                        Send welcome emails to new users when they're invited
                      </p>
                    </div>
                    <Switch
                      checked={settings.welcome_email_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, welcome_email_enabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">Monthly Reports</h4>
                      <p className="text-sm text-muted-foreground">
                        Send automated monthly analytics reports to org admins
                      </p>
                    </div>
                    <Switch
                      checked={settings.monthly_report_enabled}
                      onCheckedChange={(checked) =>
                        setSettings({ ...settings, monthly_report_enabled: checked })
                      }
                    />
                  </div>
                </div>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-600">Email Service Required</h4>
                      <p className="text-sm text-muted-foreground">
                        Email notifications require an email service to be configured in the
                        backend. Contact your administrator to enable this feature.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Settings History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Recent Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setting</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.slice(0, 5).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.setting_name}</TableCell>
                      <TableCell>{item.changed_by}</TableCell>
                      <TableCell>{new Date(item.changed_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
