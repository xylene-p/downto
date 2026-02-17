"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";
import * as db from "./db";
import type {
  Profile,
  Event,
  SavedEvent,
  InterestCheck,
  CheckResponse,
  Squad,
  Message,
  EventView,
  InterestCheckView,
  SquadView,
  FriendView,
} from "./types";

// ============================================================================
// AUTH HOOK
// ============================================================================

export function useAuth() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? "" });
        // Fetch profile
        const profile = await db.getCurrentProfile();
        setProfile(profile);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? "" });
        // Fetch profile (may need small delay for trigger to complete)
        setTimeout(async () => {
          const profile = await db.getCurrentProfile();
          setProfile(profile);
        }, 500);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    const updated = await db.updateProfile(updates);
    setProfile(updated);
    return updated;
  }, []);

  return { user, profile, loading, signOut, updateProfile };
}

// ============================================================================
// EVENTS HOOK
// ============================================================================

export function useEvents() {
  const [savedEvents, setSavedEvents] = useState<EventView[]>([]);
  const [publicEvents, setPublicEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const [saved, pub] = await Promise.all([
        db.getSavedEvents(),
        db.getPublicEvents(),
      ]);

      setSavedEvents(
        saved.map((se) => transformEventToView(se.event!, se.is_down, true))
      );
      setPublicEvents(pub.map((e) => transformEventToView(e, false, false)));
    } catch (err) {
      console.error("Failed to fetch events:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const saveEvent = useCallback(
    async (eventId: string) => {
      await db.saveEvent(eventId);
      await fetchEvents();
    },
    [fetchEvents]
  );

  const unsaveEvent = useCallback(
    async (eventId: string) => {
      await db.unsaveEvent(eventId);
      await fetchEvents();
    },
    [fetchEvents]
  );

  const toggleDown = useCallback(
    async (eventId: string, isDown: boolean) => {
      await db.toggleDown(eventId, isDown);
      await fetchEvents();
    },
    [fetchEvents]
  );

  return {
    savedEvents,
    publicEvents,
    loading,
    saveEvent,
    unsaveEvent,
    toggleDown,
    refetch: fetchEvents,
  };
}

// ============================================================================
// FRIENDS HOOK
// ============================================================================

export function useFriends() {
  const [friends, setFriends] = useState<FriendView[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    try {
      const [friendsList, pending] = await Promise.all([
        db.getFriends(),
        db.getPendingRequests(),
      ]);

      setFriends(
        friendsList.map(({ profile: p }) => ({
          id: p.id,
          name: p.display_name,
          username: p.username,
          avatar: p.avatar_letter,
          status: "friend" as const,
          availability: p.availability,
        }))
      );

      setPendingRequests(
        pending.map((f) => ({
          id: f.id,
          name: f.requester!.display_name,
          username: f.requester!.username,
          avatar: f.requester!.avatar_letter,
          status: "incoming" as const,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch friends:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const sendRequest = useCallback(
    async (userId: string) => {
      await db.sendFriendRequest(userId);
      await fetchFriends();
    },
    [fetchFriends]
  );

  const acceptRequest = useCallback(
    async (friendshipId: string) => {
      await db.acceptFriendRequest(friendshipId);
      await fetchFriends();
    },
    [fetchFriends]
  );

  return {
    friends,
    pendingRequests,
    loading,
    sendRequest,
    acceptRequest,
    refetch: fetchFriends,
  };
}

// ============================================================================
// INTEREST CHECKS HOOK
// ============================================================================

export function useInterestChecks() {
  const [checks, setChecks] = useState<InterestCheckView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getActiveChecks();
      setChecks(data.map(transformCheckToView));
    } catch (err) {
      console.error("Failed to fetch checks:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchChecks();
    // Refresh every minute to update expiry times
    const interval = setInterval(fetchChecks, 60000);
    return () => clearInterval(interval);
  }, [fetchChecks]);

  const createCheck = useCallback(
    async (text: string) => {
      await db.createInterestCheck(text);
      await fetchChecks();
    },
    [fetchChecks]
  );

  const respond = useCallback(
    async (checkId: string, response: "down" | "maybe" | "nah") => {
      await db.respondToCheck(checkId, response);
      await fetchChecks();
    },
    [fetchChecks]
  );

  return { checks, loading, createCheck, respond, refetch: fetchChecks };
}

// ============================================================================
// SQUADS HOOK
// ============================================================================

export function useSquads() {
  const [squads, setSquads] = useState<SquadView[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSquads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await db.getSquads();
      setSquads(data.map(transformSquadToView));
    } catch (err) {
      console.error("Failed to fetch squads:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSquads();
  }, [fetchSquads]);

  const createSquad = useCallback(
    async (
      name: string,
      memberIds: string[],
      eventId?: string,
      checkId?: string
    ) => {
      const squad = await db.createSquad(name, memberIds, eventId, checkId);
      await fetchSquads();
      return squad;
    },
    [fetchSquads]
  );

  const sendMessage = useCallback(
    async (squadId: string, text: string) => {
      await db.sendMessage(squadId, text);
      await fetchSquads();
    },
    [fetchSquads]
  );

  return { squads, loading, createSquad, sendMessage, refetch: fetchSquads };
}

// ============================================================================
// REALTIME MESSAGES HOOK
// ============================================================================

export function useSquadMessages(squadId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!squadId) return;

    const channel = db.subscribeToMessages(squadId, (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [squadId]);

  return messages;
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

function transformEventToView(
  event: Event,
  isDown: boolean,
  saved: boolean
): EventView {
  return {
    id: event.id,
    title: event.title,
    venue: event.venue ?? "",
    neighborhood: event.neighborhood ?? undefined,
    date: event.date_display ?? "",
    time: event.time_display ?? "",
    vibe: event.vibes,
    image: event.image_url ?? "",
    igHandle: event.ig_handle ?? "",
    saved,
    isDown,
    isPublic: event.is_public,
    peopleDown: [], // Will be fetched separately when needed
  };
}

function transformCheckToView(
  check: InterestCheck & {
    author: Profile;
    responses: (CheckResponse & { user: Profile })[];
  }
): InterestCheckView {
  const now = new Date();
  const created = new Date(check.created_at);
  const msElapsed = now.getTime() - created.getTime();
  const minsElapsed = Math.floor(msElapsed / (1000 * 60));
  const hoursElapsed = Math.floor(msElapsed / (1000 * 60 * 60));

  let expiresIn: string;
  let expiryPercent: number;
  if (!check.expires_at) {
    expiresIn = "open";
    expiryPercent = 0;
  } else {
    const expires = new Date(check.expires_at);
    const totalDuration = expires.getTime() - created.getTime();
    expiryPercent = Math.min(100, (msElapsed / totalDuration) * 100);
    const msRemaining = expires.getTime() - now.getTime();
    const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
    const minsRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    expiresIn = hoursRemaining > 0 ? `${hoursRemaining}h` : minsRemaining > 0 ? `${minsRemaining}m` : "expired";
  }

  return {
    id: check.id,
    text: check.text,
    author: check.author.display_name,
    authorId: check.author_id,
    timeAgo:
      hoursElapsed > 0
        ? `${hoursElapsed}h`
        : minsElapsed > 0
          ? `${minsElapsed}m`
          : "now",
    expiresIn,
    expiryPercent,
    responses: check.responses.map((r) => ({
      name: r.user?.display_name ?? "Unknown",
      avatar: r.user?.avatar_letter ?? "?",
      status: r.response,
    })),
  };
}

function transformSquadToView(squad: Squad): SquadView {
  const messages =
    squad.messages?.map((m) => ({
      sender: m.sender?.display_name ?? "Unknown",
      text: m.text,
      time: formatTime(new Date(m.created_at)),
      isYou: false, // Will be set by consumer based on current user
    })) ?? [];

  const lastMessage = messages[messages.length - 1];

  return {
    id: squad.id,
    name: squad.name,
    event: squad.event
      ? `${squad.event.title} — ${squad.event.date_display}`
      : undefined,
    members:
      squad.members?.map((m) => ({
        name: m.user?.display_name ?? "Unknown",
        avatar: m.user?.avatar_letter ?? "?",
      })) ?? [],
    messages,
    lastMsg: lastMessage ? `${lastMessage.sender}: ${lastMessage.text}` : "",
    time: lastMessage
      ? formatTimeAgo(new Date(squad.messages![squad.messages!.length - 1].created_at))
      : "",
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return "now";
}
