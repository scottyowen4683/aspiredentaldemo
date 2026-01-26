// src/services/userService.ts
import { supabase } from "../supabaseClient";

export interface User {
  id: string;
  auth_id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "org_admin" | "member";
  org_id: string | null;
  created_at: string;
  last_login: string | null;
  locked?: boolean;
  // Derived fields
  organization_name?: string | null;
  status?: "active" | "inactive";
}

export interface UserStats {
  totalUsers: number;
  totalAdmins: number;
  totalSuperAdmins: number;
}

/**
 * Fetch all users with optional organization info
 */
export async function getAllUsers(): Promise<{
  success: boolean;
  data?: User[];
  error?: string;
}> {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching users:", error);
      return { success: false, error: error.message };
    }

    if (!users?.length) return { success: true, data: [] };

    // Optionally get related organization names
    const orgIds = users.filter(u => u.org_id).map(u => u.org_id!);
    let orgMap: Record<string, string> = {};

    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      orgMap = Object.fromEntries(orgs?.map(o => [o.id, o.name]) || []);
    }

    const enrichedUsers: User[] = users.map(u => ({
      ...u,
      organization_name: u.org_id ? orgMap[u.org_id] || "N/A" : "—",
      status: "active",
    }));

    return { success: true, data: enrichedUsers };
  } catch (error) {
    console.error("Unexpected error fetching users:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Fetch user stats summary
 */
export async function getUserStats(): Promise<{
  success: boolean;
  data?: UserStats;
  error?: string;
}> {
  try {
    const { count: totalUsers } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    const { count: totalAdmins } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "org_admin");

    const { count: totalSuperAdmins } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "super_admin");

      

    return {
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalAdmins: totalAdmins || 0,
        totalSuperAdmins: totalSuperAdmins || 0,
      },
    };
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update a user's fields in the users table
 */
export async function updateUser(id: string, updates: Partial<{ full_name: string | null; role: User['role']; org_id: string | null; locked?: boolean }>): Promise<{
  success: boolean;
  data?: User;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err) {
    console.error('Unexpected error updating user:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Delete a user using the Supabase Functions endpoint which runs with service role.
 * The function will remove the user from Supabase Auth and delete the users table record.
 */
export async function deleteUser(authId: string, userId: string): Promise<{ success: boolean; error?: string; warning?: string }>{
  try {
    // Use Supabase Functions invoke if available
    // Fallback to fetch to /functions/v1/delete-user
  const supabaseWithFunctions = supabase as unknown as { functions?: { invoke?: (name: string, opts?: unknown) => Promise<unknown> } };
    if (supabaseWithFunctions.functions && typeof supabaseWithFunctions.functions.invoke === 'function') {
      const resp = await supabaseWithFunctions.functions.invoke('delete-user', {
        body: { authId, userId }
      });
      if (!resp) return { success: false, error: 'No response from function' };
      // resp may be a Fetch API Response-like object (supabase-js returns parsed json)
  const respObj = resp as unknown as Record<string, unknown>;
  const result = (respObj.data ?? respObj) as Record<string, unknown> | undefined;
  if (result && result.success === true) return { success: true };
  return { success: false, error: (result && (result.message as string)) || 'Failed to delete user' };
    }

    // fallback fetch
    const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/delete-user';
    const r = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
      },
      body: JSON.stringify({ authId, userId })
    });
    const j = await r.json();
    if (j?.success) return { success: true };
    return { success: false, error: j?.message || 'Failed to delete user' };
  } catch (err) {
    console.error('Error invoking delete-user function:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}


