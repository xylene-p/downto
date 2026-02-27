"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import * as db from "@/lib/db";
import { logWarn } from "@/lib/logger";

// ─── Hook ──────────────────────────────────────────────────────────────────

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_user_id: string | null;
  related_squad_id: string | null;
  related_check_id: string | null;
  is_read: boolean;
  created_at: string;
};

interface UseNotificationsParams {
  userId: string | null;
  isDemoMode: boolean;
}

export function useNotifications({ userId, isDemoMode }: UseNotificationsParams) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadSquadMessage, setHasUnreadSquadMessage] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const [notifs, count, hasSquadUnread] = await Promise.all([
        db.getNotifications(),
        db.getUnreadCount(),
        db.hasUnreadSquadMessages(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
      if (hasSquadUnread) setHasUnreadSquadMessage(true);
    } catch (err) {
      logWarn("loadNotifications", "Failed to load notifications", { error: err });
    }
  }, []);

  const loadNotificationsRef = useRef(loadNotifications);
  loadNotificationsRef.current = loadNotifications;

  // Load initial notifications
  useEffect(() => {
    if (isDemoMode || !userId) return;
    loadNotificationsRef.current();
  }, [isDemoMode, userId]);

  // Reload notifications on app focus
  useEffect(() => {
    if (isDemoMode || !userId) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadNotificationsRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isDemoMode, userId]);

  return {
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    hasUnreadSquadMessage,
    setHasUnreadSquadMessage,
    notificationsOpen,
    setNotificationsOpen,
    loadNotifications,
    loadNotificationsRef,
  };
}
