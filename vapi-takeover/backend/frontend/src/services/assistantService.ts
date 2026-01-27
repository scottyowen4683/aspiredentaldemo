import { supabase } from "@/supabaseClient";
import { logAuditEvent, AUDIT_ACTIONS } from "@/services/auditService";

export type KBType = "Link" | "Text" | "PDF";

export interface CreateAssistantInput {
  provider?: string;
  apiKey?: string | null;
  friendlyName?: string | null;
  prompt?: string | null;
  kbType?: KBType;
  kbUrl?: string | null;
  kbText?: string | null;
  kbFile?: File | null;
  defaultRubric?: string | null;
  transcriptSource?: string | null;
  autoScore?: boolean;
  orgId?: string | null;
  // Also support snake_case properties from AddAssistantModal
  org_id?: string | null;
  friendly_name?: string | null;
  bot_type?: string | null;
  phone_number?: string | null;
  elevenlabs_voice_id?: string | null;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  first_message?: string | null;
  kb_enabled?: boolean | null;
  auto_score?: boolean | null;
  background_sound?: string | null;
  background_volume?: number | null;
  // New feature fields
  use_default_prompt?: boolean | null;
  call_transfer_enabled?: boolean | null;
  call_transfer_number?: string | null;
  sms_enabled?: boolean | null;
  sms_notification_number?: string | null;
  email_notifications_enabled?: boolean | null;
  email_notification_address?: string | null;
  // Data retention policy (days)
  data_retention_days?: number | null;
}

export async function createAssistant(input: CreateAssistantInput, userId?: string) {
  try {
    // Support both camelCase and snake_case inputs (for backwards compatibility)
    const friendlyName = input.friendlyName ?? input.friendly_name ?? null;
    const orgId = input.orgId ?? input.org_id ?? null;
    const autoScore = input.autoScore ?? input.auto_score ?? true;
    const botType = input.bot_type ?? 'voice';
    const phoneNumber = input.phone_number ?? null;

    // Debug logging - remove after confirming fix works
    console.log('[createAssistant v2] Starting with:', { friendlyName, botType, phoneNumber, orgId });

    // Validate Twilio phone number for voice assistants
    if (botType === 'voice' && phoneNumber) {
      console.log('[createAssistant v2] Validating Twilio number:', phoneNumber);
      try {
        const validationResponse = await fetch('/api/admin/validate-twilio-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: phoneNumber })
        });

        if (!validationResponse.ok) {
          return {
            success: false,
            error: {
              message: `Failed to validate phone number. Server returned ${validationResponse.status}`
            }
          };
        }

        const validationResult = await validationResponse.json();

        if (!validationResult.valid) {
          return {
            success: false,
            error: {
              message: validationResult.error || `Phone number ${phoneNumber} is not a valid Twilio number in your account. Please add it to your Twilio account first.`
            }
          };
        }

        // Log successful validation
        console.log('Twilio number validated:', validationResult);
      } catch (validationError) {
        console.error('Twilio validation request failed:', validationError);
        return {
          success: false,
          error: {
            message: 'Unable to validate phone number. Please check that the server is running and try again.'
          }
        };
      }
    }

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

    // Build insert object with only fields that exist in the database schema
    // Core fields from initial schema (001/002)
    const insertObj: Record<string, unknown> = {
      org_id: orgId,
      friendly_name: friendlyName,
      bot_type: botType,
      active: true, // Ensure assistant is active for voice routing
      phone_number: phoneNumber,
      elevenlabs_voice_id: input.elevenlabs_voice_id ?? null,
      prompt: input.prompt ?? null,
      model: input.model ?? null,
      temperature: input.temperature ?? null,
      max_tokens: input.max_tokens ?? null,
      kb_enabled: input.kb_enabled ?? false,
      auto_score: autoScore,
    };

    // Fields from migration 006 (background sound, first message)
    if (input.background_sound !== undefined) {
      insertObj.background_sound = input.background_sound ?? null;
    }
    if (input.background_volume !== undefined) {
      insertObj.background_volume = input.background_volume ?? null;
    }
    if (input.first_message !== undefined) {
      insertObj.first_message = input.first_message ?? null;
    }

    // Fields from migration 008 (call transfer, SMS, email features)
    if (input.use_default_prompt !== undefined) {
      insertObj.use_default_prompt = input.use_default_prompt ?? true;
    }
    if (input.call_transfer_enabled !== undefined) {
      insertObj.call_transfer_enabled = input.call_transfer_enabled ?? false;
    }
    if (input.call_transfer_number !== undefined) {
      insertObj.call_transfer_number = input.call_transfer_number ?? null;
    }
    if (input.sms_enabled !== undefined) {
      insertObj.sms_enabled = input.sms_enabled ?? false;
    }
    if (input.sms_notification_number !== undefined) {
      insertObj.sms_notification_number = input.sms_notification_number ?? null;
    }
    if (input.email_notifications_enabled !== undefined) {
      insertObj.email_notifications_enabled = input.email_notifications_enabled ?? true;
    }
    if (input.email_notification_address !== undefined) {
      insertObj.email_notification_address = input.email_notification_address ?? null;
    }

    // Fields from migration 009 (data retention)
    if (input.data_retention_days !== undefined) {
      insertObj.data_retention_days = input.data_retention_days ?? 90;
    }

    const { data, error } = await supabase.from("assistants").insert([insertObj]).select().single();

    if (error) {
      return { success: false, error };
    }

    // Log audit event for assistant creation
    if (userId) {
      await logAuditEvent({
        org_id: orgId || null,
        user_id: userId,
        assistant_id: data.id,
        action: AUDIT_ACTIONS.ASSISTANT_CREATED,
        details: {
          assistant_name: friendlyName || 'Unnamed Assistant',
          bot_type: botType,
          kb_type: input.kbType,
          has_kb: !!kb_path,
          auto_score_enabled: autoScore,
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
  friendly_name?: string | null;
  bot_type?: string | null;
  assistant_type?: string | null;
  active?: boolean | null;
  phone_number?: string | null;
  elevenlabs_voice_id?: string | null;
  widget_config?: any | null;
  prompt?: string | null;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  first_message?: string | null;
  kb_enabled?: boolean | null;
  kb_match_count?: number | null;
  kb_path?: string | null;
  last_kb_upload_at?: string | null;
  kb_chunks_count?: number | null;
  total_interactions?: number | null;
  avg_interaction_time?: number | null;
  performance_rank?: number | null;
  auto_score?: boolean | null;
  background_sound?: string | null;
  background_volume?: number | null;
  // New feature fields
  use_default_prompt?: boolean | null;
  call_transfer_enabled?: boolean | null;
  call_transfer_number?: string | null;
  sms_enabled?: boolean | null;
  sms_notification_number?: string | null;
  email_notifications_enabled?: boolean | null;
  email_notification_address?: string | null;
  // Data retention policy
  data_retention_days?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Computed fields
  conversation_count?: number;
}

export async function fetchAssistants(): Promise<AssistantRow[]> {
  const { data, error } = await supabase
    .from("assistants")
    .select(
      `id, org_id, friendly_name, bot_type, active, phone_number, elevenlabs_voice_id, widget_config, prompt, model, temperature, max_tokens, first_message, kb_enabled, kb_match_count, kb_path, last_kb_upload_at, kb_chunks_count, total_interactions, avg_interaction_time, performance_rank, auto_score, background_sound, background_volume, use_default_prompt, call_transfer_enabled, call_transfer_number, sms_enabled, sms_notification_number, email_notifications_enabled, email_notification_address, data_retention_days, created_at, updated_at`
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as AssistantRow[]) || [];
}

export async function fetchAssistantsWithConversationCounts(): Promise<(AssistantRow & { conversation_count: number })[]> {
  // First get all assistants
  const assistants = await fetchAssistants();

  // Then get conversation counts for each assistant
  const assistantsWithCounts = await Promise.all(
    assistants.map(async (assistant) => {
      try {
        // Get conversation count
        const { count, error } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("assistant_id", assistant.id);

        return {
          ...assistant,
          conversation_count: error ? 0 : (count || 0)
        };
      } catch {
        return {
          ...assistant,
          conversation_count: 0
        };
      }
    })
  );

  return assistantsWithCounts;
}

export async function updateAssistant(id: string, input: CreateAssistantInput, userId?: string) {
  try {
    // Get original assistant data for audit comparison
    const { data: originalAssistant } = await supabase
      .from("assistants")
      .select("friendly_name, org_id, auto_score, phone_number, bot_type")
      .eq("id", id)
      .single();

    // Support both camelCase and snake_case inputs
    const friendlyName = input.friendlyName ?? input.friendly_name ?? null;
    const orgId = input.orgId ?? input.org_id ?? null;
    const autoScore = input.autoScore ?? input.auto_score ?? true;
    const botType = input.bot_type ?? originalAssistant?.bot_type ?? 'voice';
    const phoneNumber = input.phone_number ?? null;

    // Validate Twilio phone number if it changed for voice assistants
    if (botType === 'voice' && phoneNumber && phoneNumber !== originalAssistant?.phone_number) {
      try {
        const validationResponse = await fetch('/api/admin/validate-twilio-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: phoneNumber })
        });

        if (!validationResponse.ok) {
          return {
            success: false,
            error: {
              message: `Failed to validate phone number. Server returned ${validationResponse.status}`
            }
          };
        }

        const validationResult = await validationResponse.json();

        if (!validationResult.valid) {
          return {
            success: false,
            error: {
              message: validationResult.error || `Phone number ${phoneNumber} is not a valid Twilio number in your account.`
            }
          };
        }

        console.log('Twilio number validated for update:', validationResult);
      } catch (validationError) {
        console.error('Twilio validation request failed:', validationError);
        return {
          success: false,
          error: {
            message: 'Unable to validate phone number. Please check that the server is running and try again.'
          }
        };
      }
    }

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

    // Build update object with only fields that exist in the database schema
    // Core fields from initial schema (001/002)
    const updateObj: Record<string, unknown> = {
      org_id: orgId,
      friendly_name: friendlyName,
      bot_type: botType,
      active: true, // Ensure assistant is active for voice routing
      phone_number: phoneNumber,
      elevenlabs_voice_id: input.elevenlabs_voice_id ?? null,
      prompt: input.prompt ?? null,
      model: input.model ?? null,
      temperature: input.temperature ?? null,
      max_tokens: input.max_tokens ?? null,
      kb_enabled: input.kb_enabled ?? false,
      auto_score: autoScore,
    };

    // Fields from migration 006 (background sound, first message)
    if (input.background_sound !== undefined) {
      updateObj.background_sound = input.background_sound ?? null;
    }
    if (input.background_volume !== undefined) {
      updateObj.background_volume = input.background_volume ?? null;
    }
    if (input.first_message !== undefined) {
      updateObj.first_message = input.first_message ?? null;
    }

    // Fields from migration 008 (call transfer, SMS, email features)
    // These are optional - only include if explicitly set
    if (input.use_default_prompt !== undefined) {
      updateObj.use_default_prompt = input.use_default_prompt ?? true;
    }
    if (input.call_transfer_enabled !== undefined) {
      updateObj.call_transfer_enabled = input.call_transfer_enabled ?? false;
    }
    if (input.call_transfer_number !== undefined) {
      updateObj.call_transfer_number = input.call_transfer_number ?? null;
    }
    if (input.sms_enabled !== undefined) {
      updateObj.sms_enabled = input.sms_enabled ?? false;
    }
    if (input.sms_notification_number !== undefined) {
      updateObj.sms_notification_number = input.sms_notification_number ?? null;
    }
    if (input.email_notifications_enabled !== undefined) {
      updateObj.email_notifications_enabled = input.email_notifications_enabled ?? true;
    }
    if (input.email_notification_address !== undefined) {
      updateObj.email_notification_address = input.email_notification_address ?? null;
    }

    // Fields from migration 009 (data retention)
    if (input.data_retention_days !== undefined) {
      updateObj.data_retention_days = input.data_retention_days ?? 90;
    }

    const { data, error } = await supabase.from("assistants").update(updateObj).eq("id", id).select().single();
    if (error) return { success: false, error };

    // Log audit event for assistant update
    if (userId && originalAssistant) {
      const changes: Record<string, { from: any; to: any }> = {};

      if (originalAssistant.friendly_name !== friendlyName) {
        changes.name = { from: originalAssistant.friendly_name, to: friendlyName };
      }
      if (originalAssistant.bot_type !== botType) {
        changes.bot_type = { from: originalAssistant.bot_type, to: botType };
      }
      if (originalAssistant.auto_score !== autoScore) {
        changes.auto_score = { from: originalAssistant.auto_score, to: autoScore };
      }

      await logAuditEvent({
        org_id: orgId || originalAssistant.org_id || null,
        user_id: userId,
        assistant_id: id,
        action: AUDIT_ACTIONS.ASSISTANT_UPDATED,
        details: {
          assistant_name: friendlyName || originalAssistant.friendly_name || 'Unnamed Assistant',
          changes,
          kb_type: input.kbType,
          has_kb: !!kb_path,
          bot_type: botType,
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
// Build trigger: 1769402337
