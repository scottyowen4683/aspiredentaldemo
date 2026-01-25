import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import type { Organization } from "@/services/organizationService";
import { updateOrganization, updateWebhookSecrets, generateWebhookSecret, getWebhookUrls, updateOrganizationApiSettings } from "@/services/organizationService";
import { useUser } from "@/context/UserContext";

interface EditOrganizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization | null;
  onSave?: (data: { name: string; region: string }) => void;
}

export function EditOrganizationModal({ open, onOpenChange, organization, onSave }: EditOrganizationModalProps) {
  const { user } = useUser();
  const [name, setName] = useState(organization?.name ?? "");
  const [region, setRegion] = useState(organization?.region ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState<'vapi' | 'ghl' | null>(null);
  const [showVapiSecret, setShowVapiSecret] = useState(false);
  const [showGhlSecret, setShowGhlSecret] = useState(false);
  const { toast } = useToast();
  
  // Real webhook data
  const webhookUrls = organization?.id ? getWebhookUrls(organization.id) : { vapi: '', ghl: '' };
  const [vapiSecret, setVapiSecret] = useState<string>(organization?.vapi_webhook_secret ?? '');
  const [ghlSecret, setGhlSecret] = useState<string>(organization?.ghl_webhook_secret ?? '');
  
  // API Settings state
  const [ghlApiKey, setGhlApiKey] = useState<string>(organization?.ghl_api_key ?? '');
  const [ghlLocationId, setGhlLocationId] = useState<string>(organization?.ghl_location_id ?? '');
  const [ghlBaseUrl, setGhlBaseUrl] = useState<string>(organization?.ghl_base_url ?? 'https://services.leadconnectorhq.com');
  const [showGhlApiKey, setShowGhlApiKey] = useState(false);

  // Service Plan state - handle undefined values gracefully
  const [servicePlanName, setServicePlanName] = useState<string>(organization?.service_plan_name || '');
  const [monthlyServiceFee, setMonthlyServiceFee] = useState<number>(organization?.monthly_service_fee || 0);
  const [baselineHumanCostPerCall, setBaselineHumanCostPerCall] = useState<number>(organization?.baseline_human_cost_per_call || 0);
  const [coverageHours, setCoverageHours] = useState<"12hr" | "24hr">(organization?.coverage_hours || "12hr");
  const [timeZone, setTimeZone] = useState<string>(organization?.time_zone || '');

  useEffect(() => {
    console.log("Organization changed:", organization);
    console.log("Service plan fields:", {
      service_plan_name: organization?.service_plan_name,
      monthly_service_fee: organization?.monthly_service_fee,
      baseline_human_cost_per_call: organization?.baseline_human_cost_per_call,
      coverage_hours: organization?.coverage_hours,
      time_zone: organization?.time_zone
    });
    setName(organization?.name ?? "");
    setRegion(organization?.region ?? "");
    setVapiSecret(organization?.vapi_webhook_secret ?? '');
    setGhlSecret(organization?.ghl_webhook_secret ?? '');
    // API Settings
    setGhlApiKey(organization?.ghl_api_key ?? '');
    setGhlLocationId(organization?.ghl_location_id ?? '');
    setGhlBaseUrl(organization?.ghl_base_url ?? 'https://services.leadconnectorhq.com');
    // Service Plan Settings - handle undefined gracefully
    setServicePlanName(organization?.service_plan_name || '');
    setMonthlyServiceFee(organization?.monthly_service_fee || 0);
    setBaselineHumanCostPerCall(organization?.baseline_human_cost_per_call || 0);
    setCoverageHours(organization?.coverage_hours || "12hr");
    setTimeZone(organization?.time_zone || '');
    // Show secrets by default when modal opens
    setShowVapiSecret(true);
    setShowGhlSecret(true);
    setShowGhlApiKey(false);
  }, [organization, open]);

  const handleCancel = () => {
    // reset local state
    setName(organization?.name ?? "");
    setRegion(organization?.region ?? "");
    setGhlApiKey(organization?.ghl_api_key ?? '');
    setGhlLocationId(organization?.ghl_location_id ?? '');
    setGhlBaseUrl(organization?.ghl_base_url ?? 'https://services.leadconnectorhq.com');
    // Reset service plan fields - handle undefined gracefully
    setServicePlanName(organization?.service_plan_name || '');
    setMonthlyServiceFee(organization?.monthly_service_fee || 0);
    setBaselineHumanCostPerCall(organization?.baseline_human_cost_per_call || 0);
    setCoverageHours(organization?.coverage_hours || "12hr");
    setTimeZone(organization?.time_zone || '');
    onOpenChange(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // UI-only save: validate and call onSave callback if provided
    if (!name.trim()) {
      toast({ title: "Validation", description: "Organization name is required.", variant: "destructive" });
      return;
    }
    if (!organization?.id) {
      toast({ title: "Error", description: "No organization selected.", variant: "destructive" });
      return;
    }

    // Validate service plan fields if they are provided
    if (servicePlanName.trim() && monthlyServiceFee <= 0) {
      toast({ title: "Validation", description: "Monthly service fee must be greater than 0.", variant: "destructive" });
      return;
    }
    if (servicePlanName.trim() && baselineHumanCostPerCall <= 0) {
      toast({ title: "Validation", description: "Baseline human cost per call must be greater than 0.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const updateData: any = { 
        name: name.trim(), 
        region: region.trim() 
      };

      // Include service plan fields if provided
      if (servicePlanName.trim()) {
        updateData.service_plan_name = servicePlanName.trim();
        updateData.monthly_service_fee = monthlyServiceFee;
        updateData.baseline_human_cost_per_call = baselineHumanCostPerCall;
        updateData.coverage_hours = coverageHours;
        updateData.time_zone = timeZone.trim();
      }

      const result = await updateOrganization(organization.id, updateData);
      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to update organization.", variant: "destructive" });
        return;
      }

      toast({ title: "Saved", description: "Organization updated successfully." });
      // call optional callback with the updated values
      onSave?.({ name: name.trim(), region: region.trim() });
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving organization:", err);
      toast({ title: "Error", description: "Unexpected error saving organization.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiSettings = async () => {
    if (!organization?.id) {
      toast({ title: "Error", description: "No organization selected.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateOrganizationApiSettings(organization.id, {
        ghl_api_key: ghlApiKey.trim() || null,
        ghl_location_id: ghlLocationId.trim() || null,
        ghl_base_url: ghlBaseUrl.trim() || null
      });

      if (!result.success) {
        toast({ title: "Error", description: result.error || "Failed to update API settings.", variant: "destructive" });
        return;
      }

      toast({ title: "Saved", description: "API settings updated successfully." });
      onSave?.({ name, region }); // Trigger refresh
    } catch (err) {
      console.error("Error saving API settings:", err);
      toast({ title: "Error", description: "Unexpected error saving API settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshSecret = async (provider: 'vapi' | 'ghl') => {
    if (!organization?.id) {
      toast({ title: "Error", description: "No organization selected.", variant: "destructive" });
      return;
    }

    setIsRefreshing(provider);
    try {
      const newSecret = generateWebhookSecret(provider);
      const updateData = provider === 'vapi' 
        ? { vapi_webhook_secret: newSecret }
        : { ghl_webhook_secret: newSecret };

      const result = await updateWebhookSecrets(organization.id, updateData);
      
      if (!result.success) {
        toast({ 
          title: "Error", 
          description: result.error || `Failed to update ${provider.toUpperCase()} secret.`, 
          variant: "destructive" 
        });
        return;
      }

      // Update local state
      if (provider === 'vapi') {
        setVapiSecret(newSecret);
      } else {
        setGhlSecret(newSecret);
      }

      toast({ 
        title: "Success", 
        description: `${provider.toUpperCase()} webhook secret regenerated successfully.` 
      });
      
    } catch (err) {
      console.error(`Error refreshing ${provider} secret:`, err);
      toast({ 
        title: "Error", 
        description: `Unexpected error refreshing ${provider.toUpperCase()} secret.`, 
        variant: "destructive" 
      });
    } finally {
      setIsRefreshing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Edit Organization
          </DialogTitle>
          <DialogDescription className="text-sm">Update the organization's name and region.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic">
          <TabsList className={`grid w-full ${user?.role === "super_admin" ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}>
            <TabsTrigger value="basic" className="text-xs sm:text-sm">Basic Info</TabsTrigger>
            {user?.role === "super_admin" && (
              <>
                <TabsTrigger value="service-plan" className="text-xs sm:text-sm">Service Plan</TabsTrigger>
                <TabsTrigger value="webhook" className="text-xs sm:text-sm">Webhook</TabsTrigger>
                <TabsTrigger value="api" className="text-xs sm:text-sm">API Settings</TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="basic">
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  placeholder="Organization name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isSaving}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgRegion">Region</Label>
                <Input
                  id="orgRegion"
                  placeholder="Region (e.g., us-east-1)"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={isSaving}
                  className="w-full"
                />
              </div>

              <DialogFooter className="gap-2 flex-col sm:flex-row">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" className="bg-gradient-primary hover:opacity-90 w-full sm:w-auto" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="service-plan">
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Service Plan Configuration</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="servicePlanName">Service Plan Name</Label>
                    <Input
                      id="servicePlanName"
                      placeholder="e.g., AI Customer Service - 12hr Coverage"
                      value={servicePlanName}
                      onChange={(e) => setServicePlanName(e.target.value)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeZone">Time Zone</Label>
                    <Select
                      value={timeZone}
                      onValueChange={(value: string) => setTimeZone(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time (America/New_York)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (America/Chicago)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (America/Denver)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (America/Los_Angeles)</SelectItem>
                        <SelectItem value="America/Phoenix">Arizona Time (America/Phoenix)</SelectItem>
                        <SelectItem value="America/Anchorage">Alaska Time (America/Anchorage)</SelectItem>
                        <SelectItem value="Pacific/Honolulu">Hawaii Time (Pacific/Honolulu)</SelectItem>
                        <SelectItem value="America/Toronto">Toronto (America/Toronto)</SelectItem>
                        <SelectItem value="America/Vancouver">Vancouver (America/Vancouver)</SelectItem>
                        <SelectItem value="Europe/London">London (Europe/London)</SelectItem>
                        <SelectItem value="Europe/Paris">Paris (Europe/Paris)</SelectItem>
                        <SelectItem value="Europe/Berlin">Berlin (Europe/Berlin)</SelectItem>
                        <SelectItem value="Europe/Rome">Rome (Europe/Rome)</SelectItem>
                        <SelectItem value="Asia/Tokyo">Tokyo (Asia/Tokyo)</SelectItem>
                        <SelectItem value="Asia/Shanghai">Shanghai (Asia/Shanghai)</SelectItem>
                        <SelectItem value="Asia/Kolkata">India (Asia/Kolkata)</SelectItem>
                        <SelectItem value="Australia/Sydney">Sydney (Australia/Sydney)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthlyServiceFee">Monthly Service Fee ($)</Label>
                    <Input
                      id="monthlyServiceFee"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={monthlyServiceFee || ""}
                      onChange={(e) => setMonthlyServiceFee(parseFloat(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="baselineHumanCostPerCall">Human Cost per Call ($)</Label>
                    <Input
                      id="baselineHumanCostPerCall"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={baselineHumanCostPerCall || ""}
                      onChange={(e) => setBaselineHumanCostPerCall(parseFloat(e.target.value) || 0)}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="coverageHours">Coverage Hours</Label>
                    <Select
                      value={coverageHours}
                      onValueChange={(value: "12hr" | "24hr") => setCoverageHours(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select coverage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12hr">12 Hours</SelectItem>
                        <SelectItem value="24hr">24 Hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSave} 
                    className="bg-gradient-primary hover:opacity-90" 
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Service Plan"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="webhook">
            <div className="space-y-6 py-4">
              {/* VAPI Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">VAPI Integration</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <Input readOnly value={webhookUrls.vapi} className="flex-1 font-mono text-xs break-all" />
                      <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(webhookUrls.vapi); toast({ title: 'Copied', description: 'VAPI webhook URL copied to clipboard.' }); } catch (e) { toast({ title: 'Error', description: 'Clipboard not available', variant: 'destructive' }); } }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook Secret</Label>
                    <div className="flex items-center space-x-2 mt-1 flex-wrap sm:flex-nowrap">
                      <Input 
                        readOnly 
                        value={vapiSecret || ''} 
                        placeholder={vapiSecret ? '' : 'Click refresh to generate secret'} 
                        className="flex-1 font-mono text-xs min-w-0" 
                        type={showVapiSecret ? "text" : "password"} 
                      />
                      <div className="flex items-center space-x-2 flex-shrink-0">
                      {vapiSecret && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setShowVapiSecret(!showVapiSecret)}
                          title={showVapiSecret ? "Hide secret" : "Show secret"}
                        >
                          {showVapiSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={async () => { 
                          if (!vapiSecret) {
                            toast({ title: 'No Secret', description: 'Generate a secret first by clicking refresh.', variant: 'destructive' }); 
                            return; 
                          }
                          try { 
                            await navigator.clipboard.writeText(vapiSecret); 
                            toast({ title: 'Copied', description: 'VAPI secret copied to clipboard.' }); 
                          } catch (e) { 
                            toast({ title: 'Error', description: 'Clipboard not available', variant: 'destructive' }); 
                          } 
                        }}
                        disabled={!vapiSecret}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRefreshSecret('vapi')}
                        disabled={isRefreshing === 'vapi'}
                        title="Generate/regenerate secret"
                      >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing === 'vapi' ? 'animate-spin' : ''}`} />
                      </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                {/* GHL Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">GHL Integration</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                    <div className="flex items-center space-x-2 mt-1">
                      <Input readOnly value={webhookUrls.ghl} className="flex-1 font-mono text-xs break-all" />
                      <Button variant="ghost" size="icon" className="flex-shrink-0" onClick={async () => { try { await navigator.clipboard.writeText(webhookUrls.ghl); toast({ title: 'Copied', description: 'GHL webhook URL copied to clipboard.' }); } catch (e) { toast({ title: 'Error', description: 'Clipboard not available', variant: 'destructive' }); } }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Webhook Secret</Label>
                    <div className="flex items-center space-x-2 mt-1 flex-wrap sm:flex-nowrap">
                      <Input 
                        readOnly 
                        value={ghlSecret || ''} 
                        placeholder={ghlSecret ? '' : 'Click refresh to generate secret'} 
                        className="flex-1 font-mono text-xs min-w-0" 
                        type={showGhlSecret ? "text" : "password"} 
                      />
                      <div className="flex items-center space-x-2 flex-shrink-0">
                      {ghlSecret && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setShowGhlSecret(!showGhlSecret)}
                          title={showGhlSecret ? "Hide secret" : "Show secret"}
                        >
                          {showGhlSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={async () => { 
                          if (!ghlSecret) {
                            toast({ title: 'No Secret', description: 'Generate a secret first by clicking refresh.', variant: 'destructive' }); 
                            return; 
                          }
                          try { 
                            await navigator.clipboard.writeText(ghlSecret); 
                            toast({ title: 'Copied', description: 'GHL secret copied to clipboard.' }); 
                          } catch (e) { 
                            toast({ title: 'Error', description: 'Clipboard not available', variant: 'destructive' }); 
                          } 
                        }}
                        disabled={!ghlSecret}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRefreshSecret('ghl')}
                        disabled={isRefreshing === 'ghl'}
                        title="Generate/regenerate secret"
                      >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing === 'ghl' ? 'animate-spin' : ''}`} />
                      </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="api">
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-foreground">GoHighLevel API Configuration</h3>
                <p className="text-xs text-muted-foreground">
                  Configure GHL API settings for this organization to enable conversation syncing and processing.
                </p>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ghlApiKey" className="text-sm">API Key</Label>
                    <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap">
                      <Input
                        id="ghlApiKey"
                        placeholder="Enter GHL API key"
                        value={ghlApiKey}
                        onChange={(e) => setGhlApiKey(e.target.value)}
                        type={showGhlApiKey ? "text" : "password"}
                        className="flex-1 min-w-0"
                        disabled={isSaving}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowGhlApiKey(!showGhlApiKey)}
                        title={showGhlApiKey ? "Hide API key" : "Show API key"}
                        className="flex-shrink-0"
                      >
                        {showGhlApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ghlLocationId" className="text-sm">Location ID</Label>
                    <Input
                      id="ghlLocationId"
                      placeholder="Enter GHL location ID"
                      value={ghlLocationId}
                      onChange={(e) => setGhlLocationId(e.target.value)}
                      className="w-full"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ghlBaseUrl" className="text-sm">Base URL</Label>
                    <Input
                      id="ghlBaseUrl"
                      placeholder="GHL API base URL"
                      value={ghlBaseUrl}
                      onChange={(e) => setGhlBaseUrl(e.target.value)}
                      className="w-full"
                      disabled={isSaving}
                    />
                  
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    onClick={handleSaveApiSettings} 
                    disabled={isSaving}
                    className="bg-gradient-primary hover:opacity-90"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save API Settings"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default EditOrganizationModal;
