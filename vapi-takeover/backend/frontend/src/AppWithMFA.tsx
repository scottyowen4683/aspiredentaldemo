import { useEffect, useState } from "react";
import { supabase } from './supabaseClient';
import App from "./App";
import AuthMFA from "./components/MFA/AuthMFA";

export default function AppWithMFA() {
  const [readyToShow, setReadyToShow] = useState(false);
  const [showMFAScreen, setShowMFAScreen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;

        if (data.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
          setShowMFAScreen(true);
        }
      } finally {
        setReadyToShow(true);
      }
    })();
  }, []);

  if (!readyToShow) return null;
  if (showMFAScreen) return <AuthMFA onSuccess={() => setShowMFAScreen(false)} />;

  return <App />;
}