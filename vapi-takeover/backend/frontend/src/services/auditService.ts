import { supabase } from '@/supabaseClient';

export interface AuditLogEntry {
  org_id?: string | null;
  user_id?: string | null;
  assistant_id?: string | null;
  action: string;
  details?: object | null;
}

/**
 * Log an audit event to the audit_logs table
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert({
        org_id: entry.org_id || null,
        user_id: entry.user_id || null,
        assistant_id: entry.assistant_id || null,
        action: entry.action,
        details: entry.details ? JSON.stringify(entry.details) : null,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Audit log failed:', error);
      return {
        success: false,
        error: error.message
      };
    }

    console.log(`✅ Audit event logged: ${entry.action}`, entry.details);
    return { success: true };
  } catch (error) {
    console.error('Audit log exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Predefined audit actions for rubric and assistant management
export const AUDIT_ACTIONS = {
  RUBRIC_CREATED: 'rubric_created',
  RUBRIC_UPDATED: 'rubric_updated',
  RUBRIC_DELETED: 'rubric_deleted',
  ORGANIZATION_RUBRIC_CREATED: 'organization_rubric_created',
  ORGANIZATION_RUBRIC_UPDATED: 'organization_rubric_updated',
  ASSISTANT_RUBRIC_CREATED: 'assistant_rubric_created',
  ASSISTANT_RUBRIC_UPDATED: 'assistant_rubric_updated',
  ASSISTANT_RUBRIC_RESET: 'assistant_rubric_reset',
  ASSISTANT_CREATED: 'assistant_created',
  ASSISTANT_UPDATED: 'assistant_updated',
  ASSISTANT_DELETED: 'assistant_deleted',
  ASSISTANT_PATCHED: 'assistant_patched'
} as const;