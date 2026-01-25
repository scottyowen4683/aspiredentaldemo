import { supabase } from "@/supabaseClient";
import { logAuditEvent, AUDIT_ACTIONS } from "@/services/auditService";

export type KBType = "Link" | "Text" | "PDF";

export interface CreateAssistantInput {
  provider: string;
  apiKey?: string | null;
  friendlyName?: string | null;
  prompt?: string | null;
  kbType: KBType;
  kbUrl?: string | null;
  kbText?: string | null;
  kbFile?: File | null;
  defaultRubric?: string | null;
  transcriptSource?: string | null;
  autoScore?: boolean;
  orgId?: string | null;
}

export async function createAssistant(input: CreateAssistantInput, userId?: string) {
  try {
    let kb_path: string | null = null;

    if (input.kbType === "Link" && input.kbUrl) {
      kb_path = input.kbUrl;
    }

    if (input.kbType === "Text" && input.kbText) {
      // Store raw text in kb_path (schema currently only has kb_path column).
      kb_path = input.kbText;
    }

    if (input.kbType === "PDF" && input.kbFile) {
      // Upload PDF to Supabase storage. Bucket name: 'kb_uploads'
      const bucket = "kb_uploads";
      const fileName = `${Date.now()}_${input.kbFile.name}`;

      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, input.kbFile, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) {
        return { success: false, error: uploadError };
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      kb_path = publicUrlData.publicUrl;
    }

    // Normalize provider to lowercase to match Postgres enum values (enums are case-sensitive)
    const normalizedProvider = typeof input.provider === "string" ? input.provider.trim().toLowerCase() : input.provider;

    const insertObj: Record<string, unknown> = {
      provider: normalizedProvider,
      assistant_key: input.apiKey ?? null,
      org_id: input.orgId ?? null,
      friendly_name: input.friendlyName ?? null,
      prompt: input.prompt ?? null,
      kb_path: kb_path,
      rubric: input.defaultRubric ?? null,
      transcript_source: input.transcriptSource ?? null,
      auto_score: input.autoScore ?? true,
    };

    const { data, error } = await supabase.from("assistants").insert([insertObj]).select().single();

    if (error) {
      return { success: false, error };
    }

    // Log audit event for assistant creation
    if (userId) {
      await logAuditEvent({
        org_id: input.orgId || null,
        user_id: userId,
        assistant_id: data.id,
        action: AUDIT_ACTIONS.ASSISTANT_CREATED,
        details: {
          assistant_name: input.friendlyName || 'Unnamed Assistant',
          provider: normalizedProvider,
          kb_type: input.kbType,
          has_kb: !!kb_path,
          has_custom_rubric: !!input.defaultRubric,
          auto_score_enabled: input.autoScore,
          transcript_source: input.transcriptSource,
          action_timestamp: new Date().toISOString()
        }
      });
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export interface AssistantRow {
  id: string;
  org_id?: string | null;
  provider?: string | null;
  assistant_key?: string | null;
  friendly_name?: string | null;
  prompt?: string | null;
  kb_path?: string | null;
  rubric?: string | null;
  transcript_source?: string | null;
  auto_score?: boolean | null;
  pause_ingest?: boolean | null;
  pause_auto_score?: boolean | null;
  retention?: string | null;
  prompt_version?: number | null;
  kb_version?: number | null;
  rubric_version?: number | null;
  last_ingest?: string | null;
  last_score?: string | null;
  error_count?: number | null;
  assistant_type?: string | null;
  from_api?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function fetchAssistants(): Promise<AssistantRow[]> {
  const { data, error } = await supabase
    .from<AssistantRow>("assistants")
    .select(
      `id, provider, assistant_key, org_id, friendly_name, prompt, kb_path, rubric, transcript_source, auto_score, pause_ingest, pause_auto_score, retention, prompt_version, kb_version, rubric_version, last_ingest, last_score, error_count, assistant_type, from_api, created_at, updated_at`
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as AssistantRow[]) || [];
}

export async function fetchAssistantsWithConversationCounts(): Promise<(AssistantRow & { conversation_count: number })[]> {
  // First get all assistants
  const assistants = await fetchAssistants();
  
  // Then get conversation counts and last score for each assistant
  const assistantsWithCounts = await Promise.all(
    assistants.map(async (assistant) => {
      // Get conversation count
      const { count, error } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("assistant_id", assistant.id);
      
      // Get last score timestamp directly using assistant_id (much more efficient)
      const { data: lastScoreData } = await supabase
        .from("scores")
        .select("created_at")
        .eq("assistant_id", assistant.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      return {
        ...assistant,
        conversation_count: error ? 0 : (count || 0),
        last_score: lastScoreData?.created_at || null
      };
    })
  );
  
  return assistantsWithCounts;
}

export async function updateAssistant(id: string, input: CreateAssistantInput, userId?: string) {
  try {
    // Get original assistant data for audit comparison
    const { data: originalAssistant } = await supabase
      .from("assistants")
      .select("friendly_name, provider, org_id, kb_path, auto_score, rubric")
      .eq("id", id)
      .single();

    let kb_path: string | null = null;

    if (input.kbType === "Link" && input.kbUrl) kb_path = input.kbUrl;
    if (input.kbType === "Text" && input.kbText) kb_path = input.kbText;

    if (input.kbType === "PDF" && input.kbFile) {
      const bucket = "kb_uploads";
      const fileName = `${Date.now()}_${input.kbFile.name}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, input.kbFile, {
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) return { success: false, error: uploadError };
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      kb_path = publicUrlData.publicUrl;
    }

    const normalizedProvider = typeof input.provider === "string" ? input.provider.trim().toLowerCase() : input.provider;

    const updateObj: Record<string, unknown> = {
      provider: normalizedProvider,
      assistant_key: input.apiKey ?? null,
      org_id: input.orgId ?? null,
      friendly_name: input.friendlyName ?? null,
      prompt: input.prompt ?? null,
      kb_path: kb_path,
      rubric: input.defaultRubric ?? null,
      transcript_source: input.transcriptSource ?? null,
      auto_score: input.autoScore ?? true,
    };

    const { data, error } = await supabase.from("assistants").update(updateObj).eq("id", id).select().single();
    if (error) return { success: false, error };

    // Log audit event for assistant update
    if (userId && originalAssistant) {
      const changes: Record<string, { from: any; to: any }> = {};
      
      if (originalAssistant.friendly_name !== input.friendlyName) {
        changes.name = { from: originalAssistant.friendly_name, to: input.friendlyName };
      }
      if (originalAssistant.provider !== normalizedProvider) {
        changes.provider = { from: originalAssistant.provider, to: normalizedProvider };
      }
      if (originalAssistant.auto_score !== input.autoScore) {
        changes.auto_score = { from: originalAssistant.auto_score, to: input.autoScore };
      }
      if (!!originalAssistant.kb_path !== !!kb_path) {
        changes.kb_updated = { from: !!originalAssistant.kb_path, to: !!kb_path };
      }

      await logAuditEvent({
        org_id: input.orgId || originalAssistant.org_id || null,
        user_id: userId,
        assistant_id: id,
        action: AUDIT_ACTIONS.ASSISTANT_UPDATED,
        details: {
          assistant_name: input.friendlyName || originalAssistant.friendly_name || 'Unnamed Assistant',
          changes,
          kb_type: input.kbType,
          has_kb: !!kb_path,
          provider: normalizedProvider,
          action_timestamp: new Date().toISOString()
        }
      });
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function deleteAssistant(id: string, userId?: string) {
  try {
    // Get assistant data before deletion for audit logging
    const { data: assistantData } = await supabase
      .from("assistants")
      .select("friendly_name, provider, org_id")
      .eq("id", id)
      .single();

    const { data, error } = await supabase.from("assistants").delete().eq("id", id).select().single();
    if (error) return { success: false, error };

    // Log audit event for assistant deletion
    if (userId && assistantData) {
      await logAuditEvent({
        org_id: assistantData.org_id || null,
        user_id: userId,
        assistant_id: id,
        action: AUDIT_ACTIONS.ASSISTANT_DELETED,
        details: {
          assistant_name: assistantData.friendly_name || 'Unnamed Assistant',
          provider: assistantData.provider,
          action_timestamp: new Date().toISOString()
        }
      });
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function patchAssistant(id: string, patch: Record<string, unknown>, userId?: string) {
  try {
    // Get assistant data for audit logging
    const { data: assistantData } = await supabase
      .from("assistants")
      .select("friendly_name, provider, org_id")
      .eq("id", id)
      .single();

    const { data, error } = await supabase.from("assistants").update(patch).eq("id", id).select().single();
    if (error) return { success: false, error };

    // Log audit event for assistant patch
    if (userId && assistantData) {
      await logAuditEvent({
        org_id: assistantData.org_id || null,
        user_id: userId,
        assistant_id: id,
        action: AUDIT_ACTIONS.ASSISTANT_PATCHED,
        details: {
          assistant_name: assistantData.friendly_name || 'Unnamed Assistant',
          provider: assistantData.provider,
          patch_fields: Object.keys(patch),
          patch_values: patch,
          action_timestamp: new Date().toISOString()
        }
      });
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err };
  }
}
