"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import { logError } from "@/lib/logger";

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    let loadingCleared = false;
    const clearLoading = () => {
      if (!loadingCleared) {
        loadingCleared = true;
        setIsLoading(false);
      }
    };

    // Hard safety net: always clear loading after 3 seconds no matter what
    const safetyTimer = setTimeout(clearLoading, 3000);

    const handleSession = async (session: Session | null) => {
      try {
        if (session?.user) {
          setIsLoggedIn(true);
          setUserId(session.user.id);

          // Fetch profile with timeout — don't let it block loading
          try {
            const { data } = await Promise.race([
              supabase.from('profiles').select('*').eq('id', session.user.id).single(),
              new Promise<{ data: null; error: null }>((r) =>
                setTimeout(() => r({ data: null, error: null }), 3000)
              ),
            ]);
            if (data) {
              setProfile(data as Profile);
            }
          } catch {
            // Profile fetch failed — app will work without it
          }
        }
      } catch (err) {
        logError("authSession", err);
      } finally {
        clearLoading();
        clearTimeout(safetyTimer);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
          handleSession(session);
        } else if (event === "SIGNED_OUT") {
          setIsLoggedIn(false);
          setUserId(null);
          setProfile(null);
          clearLoading();
          clearTimeout(safetyTimer);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  return {
    isLoggedIn,
    setIsLoggedIn,
    isLoading,
    userId,
    setUserId,
    profile,
    setProfile,
    isDemoMode,
    setIsDemoMode,
  };
}
