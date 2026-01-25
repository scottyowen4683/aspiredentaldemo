import { supabase } from '@/supabaseClient';

interface GHLVoiceAgent {
  id: string;
  locationId: string;
  agentName: string;
  businessName: string;
  welcomeMessage: string;
  agentPrompt: string;
  voiceId: string;
  language: string;
  patienceLevel: string;
  maxCallDuration: number;
  timezone: string;
  // ... other voice agent fields
}

interface GHLTextAgent {
  id: string;
  locationId: string;
  name: string;
  businessName: string;
  goal: string;
  personality: string;
  instructions: string;
  mode: string;
  channels: string[];
  // ... other text agent fields
}

// Simplified interfaces for partial updates from modal
interface PartialVoiceAgent {
  id: string;
  agentName?: string;
  businessName?: string;
  agentPrompt?: string;
  locationId?: string;
}

interface PartialTextAgent {
  id: string;
  name?: string;
  businessName?: string;
  goal?: string;
  personality?: string;
  instructions?: string;
}

interface GHLVoiceResponse {
  agents: GHLVoiceAgent[];
  total: number;
  page: number;
  pageSize: number;
}

interface GHLTextResponse {
  agents: GHLTextAgent[];
  totalCount: number;
  count: number;
}

interface SyncResult {
  success: boolean;
  synced: number;
  updated: number;
  errors: string[];
}

export const ghlAssistantService = {
  /**
   * Fetch voice AI agents from GHL API
   */
  async fetchVoiceAgents(ghlApiKey: string, locationId: string): Promise<GHLVoiceAgent[]> {
    const url = `https://services.leadconnectorhq.com/voice-ai/agents?locationId=${locationId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Version': '2021-04-15',
        'Authorization': `Bearer ${ghlApiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch voice agents: ${response.status} ${response.statusText}`);
    }

    const data: GHLVoiceResponse = await response.json();
    return data.agents || [];
  },

  /**
   * Fetch conversation/text AI agents from GHL API
   */
  async fetchTextAgents(ghlApiKey: string): Promise<GHLTextAgent[]> {
    const url = 'https://services.leadconnectorhq.com/conversation-ai/agents/search';
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Version': '2021-04-15',
        'Authorization': `Bearer ${ghlApiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch text agents: ${response.status} ${response.statusText}`);
    }

    const data: GHLTextResponse = await response.json();
    return data.agents || [];
  },

  /**
   * Save or update a voice assistant in the database
   */
  async saveVoiceAssistant(agent: GHLVoiceAgent | PartialVoiceAgent, orgId: string): Promise<{ success: boolean; error?: string; isNew: boolean }> {
    try {
      // Check if assistant already exists
      const { data: existing, error: fetchError } = await supabase
        .from('assistants')
        .select('id, prompt, prompt_version')
        .eq('assistant_key', agent.id)
        .eq('org_id', orgId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      const agentPrompt = (agent as GHLVoiceAgent).agentPrompt || '';
      const promptChanged = existing && existing.prompt !== agentPrompt;
      const newPromptVersion = existing 
        ? (promptChanged ? (existing.prompt_version || 1) + 1 : existing.prompt_version || 1)
        : 1;

      const assistantData = {
        org_id: orgId,
        provider: 'ghl' as const,
        assistant_key: agent.id,
        friendly_name: (agent as GHLVoiceAgent).agentName || agent.businessName || 'Unnamed Assistant',
        prompt: agentPrompt,
        assistant_type: 'voice',
        from_api: true,
        prompt_version: newPromptVersion,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // Update existing assistant
        const { error: updateError } = await supabase
          .from('assistants')
          .update(assistantData)
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { success: true, isNew: false };
      } else {
        // Insert new assistant
        const { error: insertError } = await supabase
          .from('assistants')
          .insert({
            ...assistantData,
            created_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
        return { success: true, isNew: true };
      }
    } catch (error) {
      console.error('Error saving voice assistant:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        isNew: false 
      };
    }
  },

  /**
   * Save or update a text assistant in the database
   */
  async saveTextAssistant(agent: GHLTextAgent | PartialTextAgent, orgId: string): Promise<{ success: boolean; error?: string; isNew: boolean }> {
    try {
      // Check if assistant already exists
      const { data: existing, error: fetchError } = await supabase
        .from('assistants')
        .select('id, prompt, prompt_version')
        .eq('assistant_key', agent.id)
        .eq('org_id', orgId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      // Combine goal, personality, and instructions as the prompt
      const textAgent = agent as GHLTextAgent;
      const combinedPrompt = `Goal: ${textAgent.goal || ''}\n\nPersonality: ${textAgent.personality || ''}\n\nInstructions: ${textAgent.instructions || ''}`;
      const promptChanged = existing && existing.prompt !== combinedPrompt;
      const newPromptVersion = existing 
        ? (promptChanged ? (existing.prompt_version || 1) + 1 : existing.prompt_version || 1)
        : 1;

      const assistantData = {
        org_id: orgId,
        provider: 'ghl' as const,
        assistant_key: agent.id,
        friendly_name: textAgent.name || agent.businessName || 'Unnamed Assistant',
        prompt: combinedPrompt,
        assistant_type: 'text',
        from_api: true,
        prompt_version: newPromptVersion,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        // Update existing assistant
        const { error: updateError } = await supabase
          .from('assistants')
          .update(assistantData)
          .eq('id', existing.id);

        if (updateError) throw updateError;
        return { success: true, isNew: false };
      } else {
        // Insert new assistant
        const { error: insertError } = await supabase
          .from('assistants')
          .insert({
            ...assistantData,
            created_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
        return { success: true, isNew: true };
      }
    } catch (error) {
      console.error('Error saving text assistant:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        isNew: false 
      };
    }
  },

  /**
   * Sync all GHL assistants for an organization
   */
  async syncGHLAssistants(orgId: string, ghlApiKey: string, ghlLocationId?: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      synced: 0,
      updated: 0,
      errors: []
    };

    try {
      // Fetch both voice and text agents
      const [voiceAgents, textAgents] = await Promise.all([
        ghlLocationId ? this.fetchVoiceAgents(ghlApiKey, ghlLocationId) : Promise.resolve([]),
        this.fetchTextAgents(ghlApiKey)
      ]);

      // Process voice agents
      for (const agent of voiceAgents) {
        const saveResult = await this.saveVoiceAssistant(agent, orgId);
        if (saveResult.success) {
          if (saveResult.isNew) {
            result.synced++;
          } else {
            result.updated++;
          }
        } else {
          result.errors.push(`Voice agent ${agent.agentName}: ${saveResult.error}`);
        }
      }

      // Process text agents
      for (const agent of textAgents) {
        const saveResult = await this.saveTextAssistant(agent, orgId);
        if (saveResult.success) {
          if (saveResult.isNew) {
            result.synced++;
          } else {
            result.updated++;
          }
        } else {
          result.errors.push(`Text agent ${agent.name}: ${saveResult.error}`);
        }
      }

      result.success = result.errors.length === 0 || (result.synced + result.updated) > 0;
      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
      return result;
    }
  }
};