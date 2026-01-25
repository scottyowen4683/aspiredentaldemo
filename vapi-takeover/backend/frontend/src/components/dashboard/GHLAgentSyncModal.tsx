import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { ghlAssistantService } from "@/services/ghlAssistantService";
import { fetchAssistants } from "@/services/assistantService";
import { useToast } from "@/hooks/use-toast";

interface GHLAgent {
  id: string;
  name: string;
  type: 'voice' | 'text';
  prompt: string;
  status: 'new' | 'existing' | 'updated';
  existingAssistantId?: string;
  selected: boolean;
  locationId?: string;
  businessName?: string;
}

interface GHLAgentSyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  ghlApiKey: string;
  ghlLocationId?: string;
  onSyncComplete: () => void;
}

export function GHLAgentSyncModal({
  open,
  onOpenChange,
  orgId,
  ghlApiKey,
  ghlLocationId,
  onSyncComplete
}: GHLAgentSyncModalProps) {
  const [agents, setAgents] = useState<GHLAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const loadAgents = async () => {
    if (!open || !ghlApiKey) return;

    setLoading(true);
    try {
      // Fetch both GHL agents and existing assistants in parallel
      const [voiceAgents, textAgents, existingAssistants] = await Promise.all([
        ghlLocationId ? ghlAssistantService.fetchVoiceAgents(ghlApiKey, ghlLocationId) : Promise.resolve([]),
        ghlAssistantService.fetchTextAgents(ghlApiKey),
        fetchAssistants()
      ]);

      // Create lookup map of existing assistants by assistant_key
      const existingMap = new Map();
      existingAssistants
        .filter(a => a.org_id === orgId && a.assistant_key)
        .forEach(a => {
          existingMap.set(a.assistant_key, a);
        });

      // Process voice agents
      const processedVoiceAgents: GHLAgent[] = voiceAgents.map(agent => {
        const existing = existingMap.get(agent.id);
        const promptChanged = existing && existing.prompt !== agent.agentPrompt;
        
        return {
          id: agent.id,
          name: agent.agentName || agent.businessName || 'Unnamed Voice Agent',
          type: 'voice',
          prompt: agent.agentPrompt || '',
          status: existing ? (promptChanged ? 'updated' : 'existing') : 'new',
          existingAssistantId: existing?.id,
          selected: !existing || promptChanged, // Auto-select new and updated agents
          locationId: agent.locationId,
          businessName: agent.businessName
        };
      });

      // Process text agents
      const processedTextAgents: GHLAgent[] = textAgents.map(agent => {
        const existing = existingMap.get(agent.id);
        const combinedPrompt = `Goal: ${agent.goal || ''}\n\nPersonality: ${agent.personality || ''}\n\nInstructions: ${agent.instructions || ''}`;
        const promptChanged = existing && existing.prompt !== combinedPrompt;
        
        return {
          id: agent.id,
          name: agent.name || agent.businessName || 'Unnamed Text Agent',
          type: 'text',
          prompt: combinedPrompt,
          status: existing ? (promptChanged ? 'updated' : 'existing') : 'new',
          existingAssistantId: existing?.id,
          selected: !existing || promptChanged, // Auto-select new and updated agents
          businessName: agent.businessName
        };
      });

      setAgents([...processedVoiceAgents, ...processedTextAgents]);
    } catch (error) {
      console.error('Error loading GHL agents:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load GHL agents",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, [open, ghlApiKey, ghlLocationId, orgId]);

  const handleSelectAll = (checked: boolean) => {
    setAgents(prev => prev.map(agent => ({ ...agent, selected: checked })));
  };

  const handleAgentToggle = (agentId: string, checked: boolean) => {
    setAgents(prev => prev.map(agent => 
      agent.id === agentId ? { ...agent, selected: checked } : agent
    ));
  };

  const handleSync = async () => {
    const selectedAgents = agents.filter(a => a.selected);
    if (selectedAgents.length === 0) {
      toast({
        title: "No Agents Selected",
        description: "Please select at least one agent to sync",
        variant: "destructive"
      });
      return;
    }

    setSyncing(true);
    try {
      let synced = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const agent of selectedAgents) {
        try {
          let result;
          if (agent.type === 'voice') {
            // Reconstruct voice agent object for the service
            const voiceAgent: any = {
              id: agent.id,
              agentName: agent.name,
              agentPrompt: agent.prompt,
              businessName: agent.businessName,
              locationId: agent.locationId
            };
            result = await ghlAssistantService.saveVoiceAssistant(voiceAgent, orgId);
          } else {
            // Reconstruct text agent object for the service
            const textAgent: any = {
              id: agent.id,
              name: agent.name,
              goal: '', // These are already combined in the prompt
              personality: '',
              instructions: agent.prompt,
              businessName: agent.businessName
            };
            result = await ghlAssistantService.saveTextAssistant(textAgent, orgId);
          }

          if (result.success) {
            if (result.isNew) synced++;
            else updated++;
          } else {
            errors.push(`${agent.name}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Show results
      if (errors.length === 0) {
        const messages = [];
        if (synced > 0) messages.push(`${synced} new assistants synced`);
        if (updated > 0) messages.push(`${updated} assistants updated`);
        
        toast({
          title: "Sync Complete",
          description: messages.join(", ") || "No changes made"
        });
        onSyncComplete();
        onOpenChange(false);
      } else {
        toast({
          title: "Sync Completed with Errors",
          description: `${synced + updated} successful, ${errors.length} errors`,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-green-50 text-green-700 border-green-200';
      case 'existing': return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'updated': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new': return <Plus className="h-3 w-3" />;
      case 'existing': return <CheckCircle2 className="h-3 w-3" />;
      case 'updated': return <AlertCircle className="h-3 w-3" />;
      default: return null;
    }
  };

  const selectedCount = agents.filter(a => a.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5" />
            <span>Sync GHL Assistants</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No GHL agents found. Please check your API settings.
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Found {agents.length} agents • {agents.filter(a => a.status === 'new').length} new • {agents.filter(a => a.status === 'updated').length} updated • {agents.filter(a => a.status === 'existing').length} unchanged
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={selectedCount === agents.length}
                    onCheckedChange={handleSelectAll}
                    id="select-all"
                  />
                  <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                    Select All ({selectedCount})
                  </label>
                </div>
              </div>

              {/* Agents List */}
              <ScrollArea className="h-96">
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <Card key={agent.id} className="transition-all hover:shadow-sm">
                      <CardHeader className="pb-3">
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            checked={agent.selected}
                            onCheckedChange={(checked) => handleAgentToggle(agent.id, checked as boolean)}
                            id={`agent-${agent.id}`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <CardTitle className="text-base truncate">{agent.name}</CardTitle>
                              <Badge 
                                variant="outline" 
                                className={agent.type === 'voice' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}
                              >
                                {agent.type === 'voice' ? 'Voice AI' : 'Text AI'}
                              </Badge>
                              <Badge variant="outline" className={getStatusColor(agent.status)}>
                                <div className="flex items-center space-x-1">
                                  {getStatusIcon(agent.status)}
                                  <span className="capitalize">{agent.status}</span>
                                </div>
                              </Badge>
                            </div>
                            {agent.businessName && agent.businessName !== agent.name && (
                              <p className="text-sm text-muted-foreground">{agent.businessName}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1 overflow-hidden">
                              <span className="block truncate">
                                {agent.prompt.length > 150 
                                  ? agent.prompt.substring(0, 150) + '...' 
                                  : agent.prompt}
                              </span>
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={loadAgents} variant="outline" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={handleSync} 
            disabled={loading || syncing || selectedCount === 0}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : `Sync ${selectedCount} Agent${selectedCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}