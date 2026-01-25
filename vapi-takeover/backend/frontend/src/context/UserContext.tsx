import { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

interface UserProfile {
  id: string;
  email: string;
  role: string;
  full_name: string;
  org_id: string;
  created_at?: string;
  last_login?: string;
  [key: string]: any; // allow extra fields
}

interface UserContextType {
  user: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refreshUser: async () => {},
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentAuthIdRef = useRef<string | null>(null);

  // Add debug logging for loading state
  console.log('[UserContext] Current state:', { user: !!user, loading });
  const navigate = useNavigate();

  useEffect(() => {
    const getUserData = async () => {
      try {
        console.log("Getting user session...");
        
        // Add timeout to prevent hanging
        const sessionPromise = supabase.auth.getSession();
       
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session timeout')), 10000) // 10 second timeout
        );
        
        const { data: { session }, error: sessionError } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]);

        if (sessionError) {
          console.error("Session error:", sessionError);
          // Don't attempt anonymous auth on session errors
          if (sessionError.message?.includes('anonymous')) {
            console.warn("Anonymous auth disabled - clearing session");
            await supabase.auth.signOut();
          }
          setUser(null);
          setLoading(false);
          return;
        }

        if (!session) {
          console.log("No session found");
          setUser(null);
          setLoading(false);
          return;
        }

        console.log("Found session, fetching user data for:", session.user.id);
        

        // Add timeout for user data fetch
        const userDataPromise = supabase
          .from("users")
          .select("id, email, role, full_name, org_id, created_at, last_login")
          .eq("auth_id", session.user.id)
          .maybeSingle();
          
        const userTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('User data fetch timeout')), 5000) // 5 second timeout
        );
        
        const { data, error } = await Promise.race([
          userDataPromise,
          userTimeoutPromise
        ]);

        if (error) {
          console.error("User fetch error:", error);
          setUser(null);
          currentAuthIdRef.current = null;
        } else {
          console.log("User data fetched:", data);
          setUser(data ?? null);
          currentAuthIdRef.current = session.user.id;
          
          // Log user info when present so developers can see the user and role in console
          if (data) {
            const role = (data.role as string) || (data.user_role as string) || (data.role_name as string) || null;
            const friendlyRole = role === "super_admin" ? "superadmin" : role === "org_admin" ? "org admin" : role;
            // Only log in non-production mode
            try {
              const mode = (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.MODE) || process.env.NODE_ENV;
              if (mode !== "production") {
                console.info("[UserContext] User logged in:", data);
                console.info("[UserContext] Role:", friendlyRole);
              }
            } catch (e) {
              console.info("[UserContext] User logged in:", data);
              console.info("[UserContext] Role:", friendlyRole);
            }
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Unexpected error in getUserData:", error);
        // Clear any corrupted session that might trigger anonymous auth
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error("Error during cleanup signout:", signOutError);
        }
        setUser(null);
        setLoading(false);
      }
    };

    getUserData();

    // Debounce function to prevent rapid auth state changes
    let authStateTimeout: NodeJS.Timeout | null = null;

    // ✅ Listen to login/logout events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      // Log auth state changes in non-production for debugging
      try {
        const mode = (typeof import.meta !== "undefined" && (import.meta as any).env && (import.meta as any).env.MODE) || process.env.NODE_ENV;
        if (mode !== "production") console.info("[UserContext] onAuthStateChange event:", _event, session?.user?.id ?? null);
      } catch (e) {
        console.info("[UserContext] onAuthStateChange event:", _event);
      }

      // Clear any pending auth state update
      if (authStateTimeout) {
        clearTimeout(authStateTimeout);
      }

      // Debounce auth state changes to prevent rapid successive calls
      authStateTimeout = setTimeout(async () => {
        // Handle sign out
        if (_event === 'SIGNED_OUT' && session === null) {
          setUser(null);
          currentAuthIdRef.current = null;
          setLoading(false);
        } 
        // Handle no session
        else if (!session) {
          setUser(null);
          currentAuthIdRef.current = null;
          setLoading(false);
        } 
        // Only refresh user data if we don't have a user yet or if the session user ID changed
        else if (!currentAuthIdRef.current || currentAuthIdRef.current !== session.user.id) {
          try {
            await getUserData();
          } catch (error) {
            console.error("Error in auth state change handler:", error);
            setUser(null);
            currentAuthIdRef.current = null;
            setLoading(false);
          }
        }
        // If currentAuthIdRef matches session.user.id, do nothing (prevents unnecessary re-renders)
      }, 100); // 100ms debounce
    });

    return () => {
      // Clear any pending timeout on cleanup
      if (authStateTimeout) {
        clearTimeout(authStateTimeout);
      }
      subscription.unsubscribe();
    };
  }, []);

  // Function to manually refresh user data
  const refreshUser = async () => {
    console.log("Refreshing user data...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log("No session found during refresh");
        setUser(null);
        return;
      }

      console.log("Refreshing user data for:", session.user.id);
      
      const { data, error } = await supabase
        .from("users")
        .select("id, email, role, full_name, org_id, created_at, last_login")
        .eq("auth_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("User refresh error:", error);
        setUser(null);
      } else {
        console.log("User data refreshed:", data);
        setUser(data ?? null);
      }
    } catch (error) {
      console.error("Unexpected error in refreshUser:", error);
    }
  };

  // ✅ Proper logout that navigates after session is cleared
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/auth", { replace: true });
  };

  return (
    <UserContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

// Custom hook for convenience
export const useUser = () => useContext(UserContext);
