import { useEffect, useState } from "react";
import { supabase } from './supabaseClient';
import App from "./App";
import AuthMFA from "./components/MFA/AuthMFA";

export default function AppWithMFA() {
  const [readyToShow, setReadyToShow] = useState(false);
  const [showMFAScreen, setShowMFAScreen] = useState(false);

  useEffect(() => {
    // Timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.warn('MFA check timed out, proceeding to app');
      setReadyToShow(true);
    }, 5000);

    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) {
          console.error('MFA check error:', error);
          throw error;
        }

        if (data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
          setShowMFAScreen(true);
        }
      } catch (e) {
        console.error('MFA check failed:', e);
      } finally {
        clearTimeout(timeout);
        setReadyToShow(true);
      }
    })();

    return () => clearTimeout(timeout);
  }, []);

  // Show loading indicator instead of blank page
  if (!readyToShow) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#0f172a',
        color: 'white'
      }}>
        Loading...
      </div>
    );
  }

  if (showMFAScreen) return <AuthMFA onSuccess={() => setShowMFAScreen(false)} />;

  return <App />;
}