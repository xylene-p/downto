"use client";

import { useState, useEffect, useRef, useCallback, CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import {
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/pushNotifications";
import { font, color } from "@/lib/styles";
import { toLocalISODate, sanitize, sanitizeVibes, parseDateToISO, parseNaturalDate, formatTimeAgo } from "@/lib/utils";
import type { Person, Event, InterestCheck, ScrapedEvent, Squad, Friend, AvailabilityStatus, Tab } from "@/lib/ui-types";
import { TABS, AVAILABILITY_OPTIONS, EXPIRY_OPTIONS } from "@/lib/ui-types";
import { DEMO_EVENTS, DEMO_CHECKS, DEMO_TONIGHT, DEMO_SQUADS, DEMO_FRIENDS, DEMO_SUGGESTIONS, DEMO_NOTIFICATIONS, DEMO_SEARCH_USERS } from "@/lib/demo-data";
import GlobalStyles from "@/components/GlobalStyles";
import Grain from "@/components/Grain";
import AuthScreen from "@/components/AuthScreen";
import ProfileSetupScreen from "@/components/ProfileSetupScreen";
import EventCard from "@/components/events/EventCard";
import EditEventModal from "@/components/events/EditEventModal";
import EventLobby from "@/components/events/EventLobby";
import AddModal from "@/components/events/PasteModal";
import UserProfileOverlay from "@/components/friends/UserProfileOverlay";
import FriendsModal from "@/components/friends/FriendsModal";
import CalendarView from "@/components/calendar/CalendarView";
import GroupsView from "@/components/squads/GroupsView";
import ProfileView from "@/components/profile/ProfileView";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import Toast from "@/components/Toast";
import SquadNotificationBanner from "@/components/SquadNotificationBanner";
import NotificationsPanel from "@/components/NotificationsPanel";





// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Check auth state on mount and listen for changes
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

    const handleSession = async (session: typeof undefined extends never ? never : any) => {
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
        console.error("Auth session error:", err);
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

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [tab, setTab] = useState<Tab>("feed");
  const [feedMode, setFeedMode] = useState<"foryou" | "tonight">("foryou");
  const [events, setEvents] = useState<Event[]>([]);
  const [tonightEvents, setTonightEvents] = useState<Event[]>([]); // Loaded from DB or demo data
  const [checks, setChecks] = useState<InterestCheck[]>([]);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [socialEvent, setSocialEvent] = useState<Event | null>(null);
  const [squadPoolMembers, setSquadPoolMembers] = useState<Person[]>([]);
  const [inSquadPool, setInSquadPool] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [suggestions, setSuggestions] = useState<Friend[]>([]); // Loaded from DB or demo data
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsInitialTab, setFriendsInitialTab] = useState<"friends" | "add">("friends");
  const [myCheckResponses, setMyCheckResponses] = useState<Record<string, "down" | "maybe">>({});
  const [squadNotification, setSquadNotification] = useState<{
    squadName: string;
    startedBy: string;
    ideaBy: string;
    members: string[];
    squadId: string;
  } | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [editingCheckText, setEditingCheckText] = useState("");
  const [autoSelectSquadId, setAutoSelectSquadId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; type: string; title: string; body: string | null; related_user_id: string | null; related_squad_id: string | null; related_check_id: string | null; is_read: boolean; created_at: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadSquadMessage, setHasUnreadSquadMessage] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const [toastAction, setToastAction] = useState<(() => void) | null>(null);
  const [addModalDefaultMode, setAddModalDefaultMode] = useState<"paste" | "idea" | "manual" | null>(null);
  const showToast = (msg: string) => {
    setToastAction(null);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };
  const showToastWithAction = (msg: string, action: () => void) => {
    setToastAction(() => action);
    setToastMsg(msg);
    setTimeout(() => { setToastMsg(null); setToastAction(null); }, 4000);
  };
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const handleEditEvent = async (updated: { title: string; venue: string; date: string; time: string; vibe: string[] }) => {
    if (!editingEvent) return;

    // Update in database if logged in
    if (!isDemoMode && userId) {
      try {
        await db.updateEvent(editingEvent.id, {
          title: updated.title,
          venue: updated.venue,
          date_display: updated.date,
          time_display: updated.time,
          vibes: updated.vibe,
        });
      } catch (err) {
        console.error("Failed to update event:", err);
        showToast("Failed to update - try again");
        return;
      }
    }

    // Update local state
    const updateList = (prev: Event[]) =>
      prev.map((e) =>
        e.id === editingEvent.id
          ? { ...e, title: updated.title, venue: updated.venue, date: updated.date, time: updated.time, vibe: updated.vibe }
          : e
      );
    setEvents(updateList);
    setTonightEvents(updateList);
    setEditingEvent(null);
    showToast("Event updated!");
  };

  const loadChecks = useCallback(async () => {
    if (isDemoMode || !userId) return;
    try {
      const activeChecks = await db.getActiveChecks();
      const transformedChecks: InterestCheck[] = activeChecks.map((c) => {
        const now = new Date();
        const created = new Date(c.created_at);
        const msElapsed = now.getTime() - created.getTime();
        const minsElapsed = Math.floor(msElapsed / (1000 * 60));
        const hoursElapsed = Math.floor(msElapsed / (1000 * 60 * 60));

        let expiresIn: string;
        let expiryPercent: number;
        if (!c.expires_at) {
          expiresIn = "open";
          expiryPercent = 0;
        } else {
          const expires = new Date(c.expires_at);
          const totalDuration = expires.getTime() - created.getTime();
          expiryPercent = Math.min(100, (msElapsed / totalDuration) * 100);
          const msRemaining = expires.getTime() - now.getTime();
          const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
          const minsRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
          expiresIn = hoursRemaining > 0 ? `${hoursRemaining}h` : minsRemaining > 0 ? `${minsRemaining}m` : "expired";
        }

        return {
          id: c.id,
          text: c.text,
          author: c.author.display_name,
          authorId: c.author_id,
          timeAgo: hoursElapsed > 0 ? `${hoursElapsed}h` : minsElapsed > 0 ? `${minsElapsed}m` : "now",
          expiresIn,
          expiryPercent,
          responses: c.responses.map((r) => ({
            name: r.user_id === userId ? "You" : (r.user?.display_name ?? "Unknown"),
            avatar: r.user?.avatar_letter ?? "?",
            status: r.response,
            odbc: r.user_id,
          })),
          isYours: c.author_id === userId,
          maxSquadSize: c.max_squad_size,
          squadId: c.squads?.[0]?.id,
          squadMemberCount: c.squads?.[0]?.members?.length ?? 0,
          eventDate: c.event_date ?? undefined,
          eventDateLabel: c.event_date ? new Date(c.event_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined,
        };
      });
      // Preserve squadId/inSquad from previous state (set by loadRealData cross-referencing)
      // so that a standalone loadChecks call (e.g. from subscribeToChecks) doesn't wipe them
      setChecks((prev) => {
        const prevMap = new Map(prev.map((c) => [c.id, c]));
        return transformedChecks.map((c) => {
          const existing = prevMap.get(c.id);
          if (existing) {
            return {
              ...c,
              squadId: c.squadId ?? existing.squadId,
              inSquad: c.inSquad ?? existing.inSquad,
            };
          }
          return c;
        });
      });
    } catch (err) {
      console.warn("Failed to load checks:", err);
    }
  }, [isDemoMode, userId]);

  // Guard against concurrent loadRealData calls
  const isLoadingRef = useRef(false);

  // Load real data when logged in (non-demo mode)
  const loadRealData = useCallback(async () => {
    if (isDemoMode || !userId) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      // Load saved events
      const savedEvents = await db.getSavedEvents();
      const savedEventIds = savedEvents.map((se) => se.event!.id);

      // Load public/tonight events
      const publicEvents = await db.getPublicEvents();
      const publicEventIds = publicEvents.map((e) => e.id);

      // Load friends' non-public events
      const friendsEvents = await db.getFriendsEvents();
      const friendsEventIds = friendsEvents.map((e) => e.id);

      // Batch fetch people down for all events
      const allEventIds = [...new Set([...savedEventIds, ...publicEventIds, ...friendsEventIds])];
      const peopleDownMap = allEventIds.length > 0
        ? await db.getPeopleDownBatch(allEventIds)
        : {};

      const transformedEvents: Event[] = savedEvents.map((se) => ({
        id: se.event!.id,
        createdBy: se.event!.created_by ?? undefined,
        title: se.event!.title,
        venue: se.event!.venue ?? "",
        date: se.event!.date_display ?? "",
        time: se.event!.time_display ?? "",
        vibe: se.event!.vibes,
        image: se.event!.image_url ?? "",
        igHandle: se.event!.ig_handle ?? "",
        igUrl: se.event!.ig_url ?? undefined,
        saved: true,
        isDown: se.is_down,
        peopleDown: peopleDownMap[se.event!.id] ?? [],
        neighborhood: se.event!.neighborhood ?? undefined,
      }));

      // Merge friends' non-public events (skip ones already saved by this user)
      const savedEventIdSet = new Set(savedEventIds);
      const friendsTransformed: Event[] = friendsEvents
        .filter((e) => !savedEventIdSet.has(e.id))
        .map((e) => ({
          id: e.id,
          createdBy: e.created_by ?? undefined,
          title: e.title,
          venue: e.venue ?? "",
          date: e.date_display ?? "",
          time: e.time_display ?? "",
          vibe: e.vibes,
          image: e.image_url ?? "",
          igHandle: e.ig_handle ?? "",
          igUrl: e.ig_url ?? undefined,
          saved: false,
          isDown: false,
          peopleDown: peopleDownMap[e.id] ?? [],
          neighborhood: e.neighborhood ?? undefined,
        }));
      setEvents([...transformedEvents, ...friendsTransformed]);

      // Build cross-reference maps for tonight events
      const savedDownMap = new Map(savedEvents.map((se) => [se.event!.id, se.is_down]));

      const transformedTonight: Event[] = publicEvents
        .filter((e) => e.venue && e.date_display) // Hide events with no venue or date
        .map((e) => ({
          id: e.id,
          createdBy: e.created_by ?? undefined,
          title: e.title,
          venue: e.venue ?? "",
          date: e.date_display ?? "Tonight",
          time: e.time_display ?? "",
          vibe: e.vibes,
          image: e.image_url ?? "",
          igHandle: e.ig_handle ?? "",
          igUrl: e.ig_url ?? undefined,
          saved: savedEventIdSet.has(e.id),
          isDown: savedDownMap.get(e.id) ?? false,
          isPublic: true,
          peopleDown: peopleDownMap[e.id] ?? [],
          neighborhood: e.neighborhood ?? undefined,
        }));
      setTonightEvents(transformedTonight);

      // Load friends
      const friendsList = await db.getFriends();
      const transformedFriends: Friend[] = friendsList.map(({ profile: p, friendshipId }) => ({
        id: p.id,
        friendshipId,
        name: p.display_name,
        username: p.username,
        avatar: p.avatar_letter,
        status: "friend" as const,
        availability: p.availability,
        igHandle: p.ig_handle ?? undefined,
      }));
      setFriends(transformedFriends);

      // Load pending friend requests (incoming)
      const pendingRequests = await db.getPendingRequests();
      const incomingFriends: Friend[] = pendingRequests.map((f) => ({
        id: f.requester!.id,
        friendshipId: f.id,
        name: f.requester!.display_name,
        username: f.requester!.username,
        avatar: f.requester!.avatar_letter,
        status: "incoming" as const,
        igHandle: f.requester!.ig_handle ?? undefined,
      }));

      // Load suggested users (people not yet friends)
      let suggestedFriends: Friend[] = [];
      try {
        const suggestedUsers = await db.getSuggestedUsers();
        suggestedFriends = suggestedUsers.map((p) => ({
          id: p.id,
          name: p.display_name,
          username: p.username,
          avatar: p.avatar_letter,
          status: "none" as const,
          igHandle: p.ig_handle ?? undefined,
        }));
      } catch (suggestErr) {
        console.warn("Failed to load suggestions:", suggestErr);
      }

      // Merge incoming requests + suggestions
      setSuggestions([...incomingFriends, ...suggestedFriends]);

      // Load interest checks
      await loadChecks();

      // Load squads (separate try/catch so other data still loads if this fails)
      try {
        const squadsList = await db.getSquads();
        const fmtTime = (iso: string) => {
          const d = new Date(iso);
          const now = new Date();
          const diffMs = now.getTime() - d.getTime();
          const diffMins = Math.floor(diffMs / (1000 * 60));
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) return `${diffDays}d`;
          if (diffHours > 0) return `${diffHours}h`;
          if (diffMins > 0) return `${diffMins}m`;
          return "now";
        };
        const transformedSquads: Squad[] = squadsList.map((s) => {
          const members = (s.members ?? []).map((m) => ({
            name: m.user_id === userId ? "You" : (m.user?.display_name ?? "Unknown"),
            avatar: m.user?.avatar_letter ?? m.user?.display_name?.charAt(0)?.toUpperCase() ?? "?",
            userId: m.user_id,
          }));
          const messages = (s.messages ?? [])
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map((msg) => ({
              sender: msg.sender_id === userId ? "You" : (msg.sender?.display_name ?? "Unknown"),
              text: msg.text,
              time: fmtTime(msg.created_at),
              isYou: msg.sender_id === userId,
            }));
          const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          return {
            id: s.id,
            name: s.name,
            event: s.event ? `${s.event.title} — ${s.event.date_display}` : undefined,
            eventDate: s.event?.date_display ?? undefined,
            eventIsoDate: s.event?.date ?? undefined,
            members,
            messages,
            lastMsg: lastMessage ? `${lastMessage.sender}: ${lastMessage.text}` : "",
            time: lastMessage ? lastMessage.time : fmtTime(s.created_at),
            checkId: s.check_id ?? undefined,
            meetingSpot: s.meeting_spot ?? undefined,
            arrivalTime: s.arrival_time ?? undefined,
            transportNotes: s.transport_notes ?? undefined,
          };
        });
        setSquads(transformedSquads);

        // Link checks to their squads
        const checkToSquad = new Map<string, { squadId: string; inSquad: boolean }>();
        for (const sq of transformedSquads) {
          if (sq.checkId) {
            checkToSquad.set(sq.checkId, {
              squadId: sq.id,
              inSquad: true, // if the squad shows up in getSquads, user is a member
            });
          }
        }
        if (checkToSquad.size > 0) {
          setChecks((prev) => prev.map((c) => {
            const sq = checkToSquad.get(c.id);
            if (sq) return { ...c, squadId: sq.squadId, inSquad: sq.inSquad };
            return c;
          }));
        }
      } catch (squadErr) {
        console.warn("Failed to load squads:", squadErr);
      }

    } catch (err) {
      console.error("Failed to load data:", err);
    } finally {
      isLoadingRef.current = false;
    }
  }, [isDemoMode, userId]);
  const loadRealDataRef = useRef(loadRealData);
  loadRealDataRef.current = loadRealData;

  // Load squad pool members when EventLobby opens
  useEffect(() => {
    if (!socialEvent?.id || isDemoMode) {
      setSquadPoolMembers([]);
      setInSquadPool(false);
      return;
    }
    (async () => {
      try {
        const pool = await db.getCrewPool(socialEvent.id);
        setInSquadPool(pool.some((entry) => entry.user_id === userId));
        // Convert pool entries to Person objects (exclude self)
        const poolPeople: Person[] = pool
          .filter((entry) => entry.user_id !== userId)
          .map((entry) => ({
            name: entry.user?.display_name ?? "Unknown",
            avatar: entry.user?.avatar_letter ?? "?",
            mutual: false,
            userId: entry.user_id,
          }));
        setSquadPoolMembers(poolPeople);
      } catch (err) {
        console.warn("Failed to load squad pool:", err);
      }
    })();
  }, [socialEvent?.id, isDemoMode, userId]);

  // Trigger data load when logged in
  useEffect(() => {
    if (isLoggedIn && !isDemoMode) {
      loadRealData();
    }
  }, [isLoggedIn, isDemoMode, loadRealData]);

  // Reload data when user returns to the app (visibility change)
  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadRealDataRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLoggedIn, isDemoMode]);

  // Load notifications and subscribe to realtime updates
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    // Load initial notifications
    const loadNotifications = async () => {
      try {
        const [notifs, count] = await Promise.all([
          db.getNotifications(),
          db.getUnreadCount(),
        ]);
        setNotifications(notifs);
        setUnreadCount(count);
      } catch (err) {
        console.warn("Failed to load notifications:", err);
      }
    };
    loadNotifications();

    // Subscribe to new notifications in realtime
    const channel = db.subscribeToNotifications(userId, async (newNotif) => {
      // Squad messages are filtered from the notification panel — only show in groups tab badge
      if (newNotif.type === "squad_message") {
        setHasUnreadSquadMessage(true);
      } else {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);
      }

      if (newNotif.type === "friend_request" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        try {
          const [profile, friendship] = await Promise.all([
            db.getProfileById(newNotif.related_user_id),
            db.getFriendshipWith(newNotif.related_user_id),
          ]);
          if (profile) {
            const incoming: Friend = {
              id: profile.id,
              friendshipId: friendship?.id ?? undefined,
              name: profile.display_name,
              username: profile.username,
              avatar: profile.avatar_letter,
              status: "incoming",
              igHandle: profile.ig_handle ?? undefined,
            };
            setSuggestions((prev) => {
              if (prev.some((s) => s.id === profile.id)) return prev;
              return [incoming, ...prev];
            });
          }
        } catch (err) {
          console.warn("Failed to fetch incoming friend profile:", err);
        }
      } else if (newNotif.type === "squad_invite") {
        if (newNotif.body) showToastRef.current(newNotif.body);
        // Reload squads so the new squad appears
        loadRealDataRef.current();
      } else if (newNotif.type === "friend_accepted" && newNotif.related_user_id) {
        if (newNotif.body) showToastRef.current(newNotif.body);
        // Refresh events so friend's events appear in For You feed
        loadRealDataRef.current();
        const relatedId = newNotif.related_user_id;
        setSuggestions((prev) => {
          const person = prev.find((s) => s.id === relatedId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== relatedId);
          }
          db.getProfileById(relatedId).then((profile) => {
            if (profile) {
              setFriends((prevFriends) => {
                if (prevFriends.some((f) => f.id === relatedId)) return prevFriends;
                return [...prevFriends, {
                  id: profile.id,
                  name: profile.display_name,
                  username: profile.username,
                  avatar: profile.avatar_letter,
                  status: "friend" as const,
                  availability: "open" as const,
                }];
              });
            }
          }).catch(() => {});
          return prev;
        });
      }
    });

    return () => { channel.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId]);

  // Subscribe to realtime friendship changes
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    const sub = db.subscribeToFriendships(userId, async (event, friendship) => {
      const otherUserId = friendship.requester_id === userId
        ? friendship.addressee_id
        : friendship.requester_id;

      if (event === "DELETE") {
        // Other user unfriended us — remove from friends list and suggestions
        setFriends((prev) => prev.filter((f) => f.id !== otherUserId));
        setSuggestions((prev) => prev.filter((s) => s.id !== otherUserId));
      } else if (event === "UPDATE" && friendship.status === "accepted") {
        // Our request was accepted, or a mutual request auto-accepted
        setSuggestions((prev) => {
          const person = prev.find((s) => s.id === otherUserId);
          if (person) {
            setFriends((prevFriends) => {
              if (prevFriends.some((f) => f.id === otherUserId)) return prevFriends;
              return [...prevFriends, { ...person, status: "friend" as const, availability: "open" as const }];
            });
            return prev.filter((s) => s.id !== otherUserId);
          }
          return prev;
        });
        // Refresh events so friend's events appear in For You feed
        loadRealDataRef.current();
      } else if (event === "INSERT" && friendship.status === "pending" && friendship.addressee_id === userId) {
        // New incoming friend request — fetch their profile
        try {
          const profile = await db.getProfileById(otherUserId);
          if (profile) {
            setSuggestions((prev) => {
              if (prev.some((s) => s.id === otherUserId)) return prev;
              return [{
                id: profile.id,
                friendshipId: friendship.id,
                name: profile.display_name,
                username: profile.username,
                avatar: profile.avatar_letter,
                status: "incoming" as const,
              }, ...prev];
            });
          }
        } catch (err) {
          console.warn("Failed to fetch friend profile:", err);
        }
      }
    });

    return () => { sub.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId]);

  // Register service worker and check push subscription status
  useEffect(() => {
    if (!isLoggedIn || isDemoMode) return;
    if (!isPushSupported()) return;
    setPushSupported(true);

    (async () => {
      const reg = await registerServiceWorker();
      if (!reg) return;
      swRegistrationRef.current = reg;

      // Check if already subscribed
      const existing = await reg.pushManager.getSubscription();
      setPushEnabled(!!existing);
    })();
  }, [isLoggedIn, isDemoMode]);

  // Subscribe to realtime interest check changes
  useEffect(() => {
    if (!isLoggedIn || isDemoMode || !userId) return;

    const sub = db.subscribeToChecks(() => {
      loadChecks();
    });

    return () => { sub.unsubscribe(); };
  }, [isLoggedIn, isDemoMode, userId, loadChecks]);

  // Listen for service worker notification click messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        const nType = event.data.notificationType;
        if (nType === 'friend_request' || nType === 'friend_accepted') {
          setTab('profile');
        } else if (nType === 'squad_message' || nType === 'squad_invite') {
          setTab('groups');
        } else if (nType === 'check_response') {
          setTab('feed');
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const handleTogglePush = async () => {
    const reg = swRegistrationRef.current;
    if (!reg) return;

    if (pushEnabled) {
      await unsubscribeFromPush(reg);
      setPushEnabled(false);
      showToast("Push notifications disabled");
    } else {
      const sub = await subscribeToPush(reg);
      if (sub) {
        setPushEnabled(true);
        showToast("Push notifications enabled!");
      } else {
        showToast("Could not enable push — check browser permissions");
      }
    }
  };

  const toggleSave = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newSaved = !event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, saved: newSaved } : e)
    );
    showToast(newSaved ? "Added to your calendar ✓" : "Removed from calendar");
    if (!isDemoMode && event.id) {
      (newSaved ? db.saveEvent(event.id) : db.unsaveEvent(event.id))
        .catch((err) => {
          console.error("Failed to toggle save:", err);
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, saved: !newSaved } : e)
          );
          showToast("Failed to save — try again");
        });
    }
  };

  const toggleDown = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) return;
    const newDown = !event.isDown;
    const prevSaved = event.saved;
    setEvents((prev) =>
      prev.map((e) => e.id === id ? { ...e, isDown: newDown, saved: newDown ? true : e.saved } : e)
    );
    showToast(newDown ? "You're down! 🤙" : "Maybe next time");
    if (!isDemoMode && event.id) {
      db.toggleDown(event.id, newDown)
        .catch((err) => {
          console.error("Failed to toggle down:", err);
          setEvents((prev) =>
            prev.map((e) => e.id === id ? { ...e, isDown: !newDown, saved: prevSaved } : e)
          );
          showToast("Failed to update — try again");
        });
    }
  };

  const respondToCheck = (checkId: string, status: "down" | "maybe") => {
    const check = checks.find((c) => c.id === checkId);
    setMyCheckResponses((prev) => ({ ...prev, [checkId]: status }));
    // Add yourself to the check's responses
    setChecks((prev) =>
      prev.map((c) => {
        if (c.id === checkId) {
          const alreadyResponded = c.responses.some((r) => r.name === "You");
          if (alreadyResponded) {
            return {
              ...c,
              responses: c.responses.map((r) =>
                r.name === "You" ? { ...r, status } : r
              ),
            };
          }
          return {
            ...c,
            responses: [...c.responses, { name: "You", avatar: profile?.avatar_letter ?? "?", status }],
          };
        }
        return c;
      })
    );
    showToast(status === "down" ? "You're down! 🤙" : "Marked as maybe");
    if (!isDemoMode && check?.id) {
      db.respondToCheck(check.id, status)
        .then(() => {
          // Reload checks after "down" to pick up auto-join squad membership from DB trigger
          if (status === "down") loadChecks();
        })
        .catch((err) => console.error("Failed to respond to check:", err));
    }
  };

  const startSquadFromCheck = async (check: InterestCheck) => {
    const maxSize = check.maxSquadSize ?? 5;
    // Cap members: maxSize - 1 (author takes one slot)
    const allDown = check.responses.filter((r) => r.status === "down" && r.name !== "You");
    const downPeople = allDown.slice(0, maxSize - 1);
    const memberNames = downPeople.map((p) => p.name);
    const squadName = check.text.slice(0, 30) + (check.text.length > 30 ? "..." : "");

    // Persist to DB in prod mode
    let squadDbId: string | undefined;
    if (!isDemoMode && check.id) {
      try {
        const memberIds = [
          ...downPeople.map((p) => p.odbc).filter((id): id is string => !!id),
          ...(check.authorId ? [check.authorId] : []),
        ];
        const dbSquad = await db.createSquad(squadName, memberIds, undefined, check.id);
        await db.sendMessage(dbSquad.id, "let's make this happen! 🔥");
        squadDbId = dbSquad.id;
      } catch (err: any) {
        console.error("Failed to create squad:", err);
        showToast(`Failed to create squad: ${err?.message || err}`);
        return;
      }
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${check.author}'s idea · ${check.expiresIn} left`,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
        ...downPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
        ...(!check.isYours ? [{ name: check.author, avatar: check.author.charAt(0).toUpperCase() }] : []),
      ],
      messages: [
        {
          sender: "system",
          text: `✨ Squad formed for "${check.text}"`,
          time: "now",
        },
        {
          sender: "system",
          text: `💡 idea by ${check.author} · 🚀 started by You`,
          time: "now",
        },
        {
          sender: "You",
          text: `let's make this happen! 🔥`,
          time: "now",
          isYou: true,
        },
      ],
      lastMsg: "You: let's make this happen! 🔥",
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);

    // Mark the check as having a squad
    setChecks((prev) => prev.map((c) => c.id === check.id ? { ...c, squadId: newSquad.id } : c));

    // Show notification
    setSquadNotification({
      squadName: check.text,
      startedBy: "You",
      ideaBy: check.author,
      members: memberNames,
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setTab("groups");
  };

  const startSquadFromEvent = async (event: Event, selectedUserIds: string[]) => {
    const squadName = event.title.slice(0, 30) + (event.title.length > 30 ? "..." : "");

    let squadDbId: string | undefined;
    if (!isDemoMode && event.id) {
      try {
        const dbSquad = await db.createSquad(squadName, selectedUserIds, event.id);
        await db.sendMessage(dbSquad.id, `squad's up for ${event.title}! 🔥`);
        squadDbId = dbSquad.id;
      } catch (err: any) {
        console.error("Failed to create squad:", err);
        showToast(`Failed to create squad: ${err?.message || err}`);
        return;
      }
    }

    // Build member display from people down + pool members
    const allCandidates = [...event.peopleDown, ...squadPoolMembers];
    const selectedPeople = allCandidates.filter((p) => p.userId && selectedUserIds.includes(p.userId));

    // Remove selected pool members from the pool
    const poolSelectedIds = squadPoolMembers
      .filter((p) => p.userId && selectedUserIds.includes(p.userId))
      .map((p) => p.userId!);
    if (poolSelectedIds.length > 0 && event.id) {
      const allToRemove = inSquadPool ? [userId!, ...poolSelectedIds] : poolSelectedIds;
      db.removeFromCrewPool(event.id, allToRemove).catch(() => {});
      setSquadPoolMembers((prev) => prev.filter((p) => !poolSelectedIds.includes(p.userId!)));
      if (inSquadPool) setInSquadPool(false);
    }

    const newSquad: Squad = {
      id: squadDbId ?? `local-squad-${Date.now()}`,
      name: squadName,
      event: `${event.title} — ${event.date}`,
      eventDate: event.date,
      members: [
        { name: "You", avatar: profile?.avatar_letter ?? "?" },
        ...selectedPeople.map((p) => ({ name: p.name, avatar: p.avatar })),
      ],
      messages: [
        {
          sender: "system",
          text: `✨ Squad formed for "${event.title}"`,
          time: "now",
        },
        {
          sender: "system",
          text: `📍 ${event.venue} · ${event.date} ${event.time}`,
          time: "now",
        },
        {
          sender: "You",
          text: `squad's up for ${event.title}! 🔥`,
          time: "now",
          isYou: true,
        },
      ],
      lastMsg: `You: squad's up for ${event.title}! 🔥`,
      time: "now",
    };
    setSquads((prev) => [newSquad, ...prev]);

    setSquadNotification({
      squadName: event.title,
      startedBy: "You",
      ideaBy: "event",
      members: selectedPeople.map((p) => p.name),
      squadId: newSquad.id,
    });
    setTimeout(() => setSquadNotification(null), 4000);

    setSocialEvent(null);
    setTab("groups");
  };

  const handleJoinSquadPool = async (event: Event) => {
    if (!event.id || isDemoMode) return;

    try {
      if (inSquadPool) {
        await db.leaveCrewPool(event.id);
        setInSquadPool(false);
        setSquadPoolMembers((prev) => prev.filter((p) => p.userId !== userId));
        showToast("Left squad pool");
        return;
      }

      await db.joinCrewPool(event.id);
      setInSquadPool(true);
      showToast("You're looking for a squad!");

      // Refresh pool members to show the full list
      const pool = await db.getCrewPool(event.id);
      const poolPeople: Person[] = pool
        .filter((entry) => entry.user_id !== userId)
        .map((entry) => ({
          name: entry.user?.display_name ?? "Unknown",
          avatar: entry.user?.avatar_letter ?? "?",
          mutual: false,
          userId: entry.user_id,
        }));
      setSquadPoolMembers(poolPeople);
    } catch (err: any) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
      if (code === '23505') {
        showToast("Already looking for a squad");
        return;
      }
      console.error("Failed to join squad pool:", err);
      showToast("Something went wrong");
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          minHeight: "100vh",
          background: color.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <GlobalStyles />
        <Grain />
        <p style={{ fontFamily: font.mono, color: color.dim, fontSize: 12 }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <AuthScreen
        onLogin={() => setIsLoggedIn(true)}
        onDemoMode={() => {
          setIsLoggedIn(true);
          setIsDemoMode(true);
          // Populate with demo data
          setEvents(DEMO_EVENTS);
          setChecks(DEMO_CHECKS);
          setSquads(DEMO_SQUADS);
          setFriends(DEMO_FRIENDS);
          setTonightEvents(DEMO_TONIGHT);
          setSuggestions(DEMO_SUGGESTIONS);
          setNotifications(DEMO_NOTIFICATIONS);
          setUnreadCount(DEMO_NOTIFICATIONS.filter(n => !n.is_read).length);
        }}
      />
    );
  }

  if (profile && !profile.onboarded) {
    return (
      <ProfileSetupScreen
        profile={profile}
        onComplete={(updated) => {
          setProfile(updated);
          setFriendsInitialTab("add");
          setFriendsOpen(true);
        }}
      />
    );
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        position: "relative",
        fontFamily: font.mono,
        overflowX: "hidden",
      }}
    >
      <GlobalStyles />
      <Grain />

      <Header
        unreadCount={unreadCount}
        onOpenNotifications={() => {
          setNotificationsOpen(true);
          if (unreadCount > 0) {
            if (!isDemoMode && userId) {
              db.markAllNotificationsRead();
            }
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            setUnreadCount(0);
          }
        }}
        onOpenAdd={() => setAddModalOpen(true)}
      />

      {/* Content */}
      <div style={{ paddingBottom: 90 }}>
        {tab === "feed" && (
          <div style={{ padding: "0 16px", animation: "fadeIn 0.3s ease" }}>
            {/* Feed mode toggle */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                padding: "0 4px",
              }}
            >
              <button
                onClick={() => setFeedMode("foryou")}
                style={{
                  background: feedMode === "foryou" ? color.accent : "transparent",
                  color: feedMode === "foryou" ? "#000" : color.dim,
                  border: feedMode === "foryou" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "foryou" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                For You
              </button>
              <button
                onClick={() => setFeedMode("tonight")}
                style={{
                  background: feedMode === "tonight" ? color.accent : "transparent",
                  color: feedMode === "tonight" ? "#000" : color.dim,
                  border: feedMode === "tonight" ? "none" : `1px solid ${color.borderMid}`,
                  borderRadius: 20,
                  padding: "8px 16px",
                  fontFamily: font.mono,
                  fontSize: 11,
                  fontWeight: feedMode === "tonight" ? 700 : 400,
                  cursor: "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Tonight ✶
              </button>
            </div>

            {feedMode === "foryou" ? (
              <>
                {/* Interest checks section */}
                {checks.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Pulse
                    </div>
                    {checks.map((check) => (
                      <div
                        key={check.id}
                        onClick={check.squadId ? () => {
                          setAutoSelectSquadId(check.squadId!);
                          setTab("groups");
                        } : undefined}
                        style={{
                          background: check.isYours ? "rgba(232,255,90,0.05)" : color.card,
                          borderRadius: 14,
                          overflow: "hidden",
                          marginBottom: 8,
                          border: `1px solid ${check.isYours ? "rgba(232,255,90,0.2)" : color.border}`,
                          cursor: check.squadId ? "pointer" : undefined,
                        }}
                      >
                        {/* Expiry progress bar — hidden for open (no expiry) checks */}
                        {check.expiresIn !== "open" && (
                          <div
                            style={{
                              height: 3,
                              background: color.border,
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: 0,
                                height: "100%",
                                width: `${100 - check.expiryPercent}%`,
                                background: check.expiryPercent > 75
                                  ? "#ff6b6b"
                                  : check.expiryPercent > 50
                                  ? "#ffaa5a"
                                  : "#4ade80",
                                transition: "width 1s ease",
                              }}
                            />
                          </div>
                        )}
                        <div style={{ padding: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 10,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: check.isYours ? color.accent : color.borderLight,
                                color: check.isYours ? "#000" : color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {check.author[0]}
                            </div>
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 11,
                                color: check.isYours ? color.accent : color.muted,
                              }}
                            >
                              {check.author}
                            </span>
                          </div>
                          <span
                            style={{
                              fontFamily: font.mono,
                              fontSize: 10,
                              color: check.expiresIn === "open" ? color.dim : check.expiryPercent > 75 ? "#ff6b6b" : color.faint,
                            }}
                          >
                            {check.expiresIn === "open" ? "open" : `${check.expiresIn} left`}
                          </span>
                        </div>
                        {editingCheckId === check.id ? (
                          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              autoFocus
                              value={editingCheckText}
                              onChange={(e) => setEditingCheckText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editingCheckText.trim()) {
                                  setChecks((prev) =>
                                    prev.map((c) =>
                                      c.id === check.id ? { ...c, text: editingCheckText.trim() } : c
                                    )
                                  );
                                  setEditingCheckId(null);
                                  showToast("Check updated!");
                                  if (!isDemoMode && check.id) {
                                    db.updateInterestCheck(check.id, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
                                  }
                                } else if (e.key === "Escape") {
                                  setEditingCheckId(null);
                                }
                              }}
                              style={{
                                flex: 1,
                                background: color.deep,
                                border: `1px solid ${color.accent}`,
                                borderRadius: 10,
                                padding: "10px 12px",
                                color: color.text,
                                fontFamily: font.serif,
                                fontSize: 16,
                                outline: "none",
                              }}
                            />
                            <button
                              onClick={() => {
                                if (editingCheckText.trim()) {
                                  setChecks((prev) =>
                                    prev.map((c) =>
                                      c.id === check.id ? { ...c, text: editingCheckText.trim() } : c
                                    )
                                  );
                                  setEditingCheckId(null);
                                  showToast("Check updated!");
                                  if (!isDemoMode && check.id) {
                                    db.updateInterestCheck(check.id, editingCheckText.trim()).catch((err) => console.error("Failed to update check:", err));
                                  }
                                }
                              }}
                              style={{
                                background: color.accent,
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontFamily: font.mono,
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
                            <div style={{ flex: 1 }}>
                              <p
                                style={{
                                  fontFamily: font.serif,
                                  fontSize: 18,
                                  color: color.text,
                                  margin: 0,
                                  fontWeight: 400,
                                  lineHeight: 1.4,
                                }}
                              >
                                {check.text}
                              </p>
                              {check.eventDateLabel && (
                                <span style={{
                                  display: "inline-block",
                                  marginTop: 6,
                                  padding: "3px 8px",
                                  background: "rgba(232,255,90,0.1)",
                                  borderRadius: 6,
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.accent,
                                  fontWeight: 600,
                                }}>
                                  📅 {check.eventDateLabel}
                                </span>
                              )}
                            </div>
                            {check.isYours && (check.squadId || check.squadId) && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  marginTop: 2,
                                  padding: "5px 10px",
                                  background: "rgba(175, 82, 222, 0.1)",
                                  borderRadius: 8,
                                  cursor: "pointer",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (check.squadId) {
                                    setAutoSelectSquadId(check.squadId);
                                  }
                                  setTab("groups");
                                }}
                              >
                                <span style={{ fontSize: 12 }}>💬</span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", fontWeight: 600 }}>
                                  Squad chat{check.squadMemberCount ? ` · ${check.squadMemberCount}/${check.maxSquadSize ?? 5}` : ""}
                                </span>
                                <span style={{ fontFamily: font.mono, fontSize: 10, color: "#AF52DE", marginLeft: "auto" }}>→</span>
                              </div>
                            )}
                            {check.isYours && !check.squadId && !check.squadId && (
                              <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: 2 }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCheckId(check.id);
                                    setEditingCheckText(check.text);
                                  }}
                                  style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: "none",
                                    color: color.dim,
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontFamily: font.mono,
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  &#9998;
                                </button>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setChecks((prev) => prev.filter((c) => c.id !== check.id));
                                    if (!isDemoMode) {
                                      try {
                                        await db.deleteInterestCheck(check.id);
                                      } catch (err) {
                                        console.error("Failed to delete check:", err);
                                      }
                                    }
                                    showToast("Check removed");
                                  }}
                                  style={{
                                    background: "rgba(255,255,255,0.06)",
                                    border: "none",
                                    color: "#ff6b6b",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    fontFamily: font.mono,
                                    fontSize: 10,
                                    cursor: "pointer",
                                  }}
                                >
                                  &#10005;
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          {check.responses.length > 0 ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "flex" }}>
                                {check.responses.map((r, i) => (
                                  <div
                                    key={r.name}
                                    style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: "50%",
                                      background:
                                        r.status === "down"
                                          ? color.accent
                                          : r.status === "maybe"
                                          ? color.borderLight
                                          : color.faint,
                                      color: r.status === "down" ? "#000" : color.dim,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontFamily: font.mono,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      marginLeft: i > 0 ? -6 : 0,
                                      border: `2px solid ${color.card}`,
                                    }}
                                  >
                                    {r.avatar}
                                  </div>
                                ))}
                              </div>
                              <span
                                style={{
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  color: color.accent,
                                }}
                              >
                                {check.responses.filter((r) => r.status === "down").length} down
                                {check.responses.some((r) => r.status === "maybe") && (
                                  <span style={{ color: color.dim }}>
                                    {" "}· {check.responses.filter((r) => r.status === "maybe").length} maybe
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontFamily: font.mono,
                                fontSize: 10,
                                color: color.faint,
                              }}
                            >
                              no responses yet
                            </span>
                          )}
                          {!check.isYours && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "down") {
                                    // Undo
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You") }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id).catch((err) => console.error("Failed to remove response:", err));
                                    }
                                  } else {
                                    respondToCheck(check.id, "down");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "down" ? color.accent : "transparent",
                                  color: myCheckResponses[check.id] === "down" ? "#000" : color.text,
                                  border: myCheckResponses[check.id] === "down" ? "none" : `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 12px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {myCheckResponses[check.id] === "down" ? "✓ Down" : "Down"}
                              </button>
                              <button
                                onClick={() => {
                                  if (myCheckResponses[check.id] === "maybe") {
                                    // Undo
                                    setMyCheckResponses((prev) => {
                                      const next = { ...prev };
                                      delete next[check.id];
                                      return next;
                                    });
                                    setChecks((prev) =>
                                      prev.map((c) =>
                                        c.id === check.id
                                          ? { ...c, responses: c.responses.filter((r) => r.name !== "You") }
                                          : c
                                      )
                                    );
                                    if (!isDemoMode && check.id) {
                                      db.removeCheckResponse(check.id).catch((err) => console.error("Failed to remove response:", err));
                                    }
                                  } else {
                                    respondToCheck(check.id, "maybe");
                                  }
                                }}
                                style={{
                                  background: myCheckResponses[check.id] === "maybe" ? color.dim : "transparent",
                                  color: myCheckResponses[check.id] === "maybe" ? "#000" : color.dim,
                                  border: `1px solid ${color.borderMid}`,
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontFamily: font.mono,
                                  fontSize: 10,
                                  cursor: "pointer",
                                }}
                              >
                                {myCheckResponses[check.id] === "maybe" ? "✓ Maybe" : "Maybe"}
                              </button>
                              {myCheckResponses[check.id] === "down" && (
                                check.squadId ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAutoSelectSquadId(check.squadId!);
                                      setTab("groups");
                                    }}
                                    style={{
                                      background: "rgba(175, 82, 222, 0.1)",
                                      color: "#AF52DE",
                                      border: "none",
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    💬 Squad Chat →
                                  </button>
                                ) : check.squadId ? (
                                  (check.squadMemberCount ?? 0) >= (check.maxSquadSize ?? 5) ? (
                                    <span style={{
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      color: color.dim,
                                      padding: "6px 10px",
                                    }}>
                                      Squad full ({check.squadMemberCount}/{check.maxSquadSize ?? 5})
                                    </span>
                                  ) : (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await db.joinSquad(check.squadId!);
                                          showToast("Joined the squad! 🚀");
                                        } catch (err: any) {
                                          const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
                                          if (code !== '23505') {
                                            console.error("Failed to join squad:", err);
                                            showToast("Failed to join squad");
                                            return;
                                          }
                                          // Already a member — proceed normally
                                        }
                                        await loadRealData();
                                        setTab("groups");
                                      }}
                                      style={{
                                        background: "transparent",
                                        color: "#AF52DE",
                                        border: "1px solid #AF52DE",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        fontFamily: font.mono,
                                        fontSize: 10,
                                        fontWeight: 700,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Join Squad Chat →
                                    </button>
                                  )
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startSquadFromCheck(check);
                                    }}
                                    style={{
                                      background: "transparent",
                                      color: color.accent,
                                      border: `1px solid ${color.accent}`,
                                      borderRadius: 8,
                                      padding: "6px 10px",
                                      fontFamily: font.mono,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Start Squad →
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {events.length > 0 ? (
                  <>
                    <div
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.15em",
                        color: color.dim,
                        marginBottom: 12,
                        padding: "0 4px",
                      }}
                    >
                      Events
                    </div>
                    {events.map((e) => (
                      <EventCard
                        key={e.id}
                        event={e}
                        onToggleSave={() => toggleSave(e.id)}
                        onToggleDown={() => toggleDown(e.id)}
                        onOpenSocial={() => setSocialEvent(e)}
                        onLongPress={
                          (e.createdBy === userId || !e.createdBy || isDemoMode) ? () => setEditingEvent(e) : undefined
                        }
                        isNew={e.id === newlyAddedId}
                      />
                    ))}
                  </>
                ) : checks.length === 0 ? (
                  <div
                    style={{
                      background: color.card,
                      border: `1px dashed ${color.borderMid}`,
                      borderRadius: 16,
                      padding: "40px 24px",
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: font.serif,
                        fontSize: 22,
                        color: color.text,
                        marginBottom: 8,
                      }}
                    >
                      {friends.length === 0 ? "Find your people" : "Your feed is empty"}
                    </p>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 12,
                        color: color.dim,
                        marginBottom: 24,
                        lineHeight: 1.6,
                      }}
                    >
                      {friends.length === 0
                        ? "Add friends to see their events and rally squads"
                        : <>Save events, add friends, or check out<br />what&apos;s happening tonight</>}
                    </p>

                    {/* Inline suggested users when 0 friends */}
                    {friends.length === 0 && suggestions.filter(s => s.status === "none").length > 0 && (
                      <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                        {suggestions.filter(s => s.status === "none").slice(0, 3).map((s) => (
                          <div
                            key={s.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              background: color.bg,
                              borderRadius: 12,
                              padding: "10px 14px",
                              textAlign: "left",
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: "50%",
                                background: color.borderMid,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 14,
                                fontWeight: 700,
                                color: color.text,
                                flexShrink: 0,
                              }}
                            >
                              {s.avatar || s.name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: font.mono, fontSize: 13, color: color.text, fontWeight: 600 }}>
                                {s.name}
                              </div>
                              <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
                                @{s.username}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (isDemoMode) {
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                  return;
                                }
                                try {
                                  await db.sendFriendRequest(s.id);
                                  setSuggestions((prev) =>
                                    prev.map((sg) => (sg.id === s.id ? { ...sg, status: "pending" as const } : sg))
                                  );
                                  showToast("Friend request sent!");
                                } catch (err) {
                                  console.error("Failed to send friend request:", err);
                                  showToast("Failed to send request");
                                }
                              }}
                              style={{
                                background: color.accent,
                                color: "#000",
                                border: "none",
                                borderRadius: 8,
                                padding: "6px 12px",
                                fontFamily: font.mono,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => { setFriendsInitialTab("add"); setFriendsOpen(true); }}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: color.accent,
                            fontFamily: font.mono,
                            fontSize: 11,
                            cursor: "pointer",
                            padding: "4px 0",
                          }}
                        >
                          See all suggestions →
                        </button>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => setAddModalOpen(true)}
                        style={{
                          background: color.accent,
                          color: "#000",
                          border: "none",
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        + Add Event
                      </button>
                      {friends.length > 0 && (
                        <button
                          onClick={() => setFriendsOpen(true)}
                          style={{
                            background: "transparent",
                            color: color.text,
                            border: `1px solid ${color.borderMid}`,
                            borderRadius: 20,
                            padding: "10px 16px",
                            fontFamily: font.mono,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Find Friends
                        </button>
                      )}
                      <button
                        onClick={() => setFeedMode("tonight")}
                        style={{
                          background: "transparent",
                          color: color.text,
                          border: `1px solid ${color.borderMid}`,
                          borderRadius: 20,
                          padding: "10px 16px",
                          fontFamily: font.mono,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Tonight ✶
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ padding: "0 4px", marginBottom: 20 }}>
                  <p
                    style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      color: color.faint,
                      lineHeight: 1.6,
                    }}
                  >
                    public events happening tonight in Brooklyn
                  </p>
                </div>
                {tonightEvents.length === 0 ? (
                  <div
                    style={{
                      padding: "40px 20px",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: font.serif,
                        fontSize: 20,
                        color: color.muted,
                        marginBottom: 8,
                      }}
                    >
                      No events tonight yet
                    </div>
                    <p
                      style={{
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.faint,
                        lineHeight: 1.6,
                      }}
                    >
                      Paste an IG link or add an event manually to get started
                    </p>
                  </div>
                ) : null}
                {tonightEvents.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: color.card,
                      borderRadius: 16,
                      overflow: "hidden",
                      marginBottom: 12,
                      border: `1px solid ${color.border}`,
                    }}
                  >
                    <div style={{ display: "flex", gap: 14, padding: 14 }}>
                      <img
                        src={e.image}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 12,
                          objectFit: "cover",
                          filter: "brightness(0.8)",
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: font.serif,
                            fontSize: 17,
                            color: color.text,
                            marginBottom: 4,
                            fontWeight: 400,
                            lineHeight: 1.2,
                          }}
                        >
                          {e.title}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.accent,
                            marginBottom: 2,
                          }}
                        >
                          {e.time}
                        </div>
                        <div
                          style={{
                            fontFamily: font.mono,
                            fontSize: 11,
                            color: color.dim,
                          }}
                        >
                          {e.venue} · {e.neighborhood}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderTop: `1px solid ${color.border}`,
                        background: color.deep,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ display: "flex" }}>
                          {e.peopleDown.slice(0, 3).map((p, i) => (
                            <div
                              key={p.name}
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: color.borderLight,
                                color: color.dim,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: font.mono,
                                fontSize: 9,
                                fontWeight: 700,
                                marginLeft: i > 0 ? -6 : 0,
                                border: `2px solid ${color.deep}`,
                              }}
                            >
                              {p.avatar}
                            </div>
                          ))}
                        </div>
                        <span
                          style={{
                            fontFamily: font.mono,
                            fontSize: 10,
                            color: color.dim,
                          }}
                        >
                          {e.peopleDown.length} going
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const newSaved = !e.saved;
                          // Update tonight UI immediately
                          setTonightEvents((prev) =>
                            prev.map((ev) =>
                              ev.id === e.id ? { ...ev, saved: newSaved } : ev
                            )
                          );
                          showToast(newSaved ? "Saved to your calendar ✓" : "Removed");

                          // Persist to DB
                          if (!isDemoMode) {
                            try {
                              if (newSaved) {
                                await db.saveEvent(e.id);
                                await db.toggleDown(e.id, true);
                                // Add to saved events list so it shows in the feed
                                const savedEvent: Event = { ...e, saved: true, isDown: true };
                                setEvents((prev) => {
                                  if (prev.some((ev) => ev.id === e.id)) return prev;
                                  return [savedEvent, ...prev];
                                });
                              } else {
                                await db.unsaveEvent(e.id);
                                // Remove from saved events list
                                setEvents((prev) => prev.filter((ev) => ev.id !== e.id));
                              }
                            } catch (err: unknown) {
                              // Ignore duplicate save (unique constraint)
                              const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
                              if (code !== '23505') {
                                console.error("Failed to save tonight event:", err);
                                showToast("Failed to save — try again");
                              }
                            }
                          }
                        }}
                        style={{
                          background: e.saved ? color.accent : "transparent",
                          color: e.saved ? "#000" : color.accent,
                          border: e.saved ? "none" : `1px solid ${color.accent}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: font.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: "pointer",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {e.saved ? "✓ Saved" : "Save"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {tab === "calendar" && <CalendarView events={events} />}
        {tab === "groups" && (
          <GroupsView
            squads={squads}
            onSquadUpdate={setSquads}
            autoSelectSquadId={autoSelectSquadId}
            onSendMessage={async (squadDbId, text) => {
              await db.sendMessage(squadDbId, text);
            }}
            onUpdateLogistics={async (squadDbId, field, value) => {
              await db.updateSquadLogistics(squadDbId, { [field]: value });
            }}
            onLeaveSquad={async (squadDbId) => {
              await db.leaveSquad(squadDbId);
            }}
            userId={userId}
            onViewProfile={(uid) => setViewingUserId(uid)}
          />
        )}
        {tab === "profile" && (
          <ProfileView
            friends={friends}
            onOpenFriends={() => setFriendsOpen(true)}
            onLogout={async () => {
              await supabase.auth.signOut();
              setIsLoggedIn(false);
              setUserId(null);
              setProfile(null);
              setIsDemoMode(false);
            }}
            profile={profile}
            pushEnabled={pushEnabled}
            pushSupported={pushSupported}
            onTogglePush={handleTogglePush}
            onAvailabilityChange={async (status) => {
              if (!isDemoMode) {
                try {
                  const updated = await db.updateProfile({ availability: status });
                  setProfile(updated);
                } catch (err) {
                  console.error("Failed to update availability:", err);
                }
              }
            }}
          />
        )}
      </div>

      <BottomNav
        tab={tab}
        onTabChange={(t) => {
          setTab(t);
          if (t === "groups") setHasUnreadSquadMessage(false);
        }}
        hasGroupsUnread={hasUnreadSquadMessage || notifications.some((n) => n.type === "squad_invite" && !n.is_read)}
      />

      {toastMsg && (
        <Toast
          message={toastMsg}
          action={toastAction}
          onDismiss={() => { setToastMsg(null); setToastAction(null); }}
        />
      )}

      {squadNotification && (
        <SquadNotificationBanner
          notification={squadNotification}
          onOpen={(squadId) => {
            setAutoSelectSquadId(squadId);
            setTab("groups");
            setSquadNotification(null);
          }}
        />
      )}

      <AddModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddModalDefaultMode(null); }}
        defaultMode={addModalDefaultMode}
        onSubmit={async (e, sharePublicly) => {
          const rawTitle = e.type === "movie" ? (e.movieTitle || e.title) : e.title;
          const title = sanitize(rawTitle, 100);
          if (!title) { showToast("Event needs a title"); return; }
          const venue = sanitize(e.venue || "TBD", 100);
          const dateDisplay = sanitize(e.date || "TBD", 50);
          const timeDisplay = sanitize(e.time || "TBD", 50);
          const vibes = sanitizeVibes(e.vibe);
          const imageUrl = e.thumbnail || "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80";
          const igHandle = sanitize(e.igHandle || "", 30);
          const igUrl = e.igUrl || null;

          // Save to database if logged in (not demo mode)
          if (!isDemoMode && userId) {
            try {
              // Check for existing event with same IG URL (dedup)
              let dbEvent: Awaited<ReturnType<typeof db.createEvent>> | null = null;
              if (igUrl) {
                dbEvent = await db.findEventByIgUrl(igUrl);
              }

              if (!dbEvent) {
                // Create the event in the database
                dbEvent = await db.createEvent({
                  title,
                  venue,
                  neighborhood: null,
                  date: parseDateToISO(dateDisplay),
                  date_display: dateDisplay,
                  time_display: timeDisplay,
                  vibes,
                  image_url: imageUrl,
                  ig_handle: igHandle,
                  ig_url: igUrl,
                  is_public: sharePublicly,
                  created_by: userId,
                });
              }

              // Save it to user's saved events
              try {
                await db.saveEvent(dbEvent.id);
              } catch (saveErr: unknown) {
                // Ignore duplicate save (unique constraint on user_id + event_id)
                const code = saveErr && typeof saveErr === 'object' && 'code' in saveErr ? (saveErr as { code: string }).code : '';
                if (code !== '23505') throw saveErr;
              }
              await db.toggleDown(dbEvent.id, true);

              // Add to local state with the real ID
              const newEvent: Event = {
                id: dbEvent.id,
                createdBy: userId,
                title: dbEvent.title || title,
                venue: dbEvent.venue || venue,
                date: dbEvent.date_display || dateDisplay,
                time: dbEvent.time_display || timeDisplay,
                vibe: dbEvent.vibes || vibes,
                image: dbEvent.image_url || imageUrl,
                igHandle: dbEvent.ig_handle || igHandle,
                igUrl: dbEvent.ig_url ?? undefined,
                saved: true,
                isDown: true,
                isPublic: dbEvent.is_public ?? sharePublicly,
                peopleDown: [],
              };
              setEvents((prev) => [newEvent, ...prev]);
              setNewlyAddedId(newEvent.id);
              setTimeout(() => setNewlyAddedId(null), 2500);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("Failed to save event:", msg);
              showToast("Failed to save - try again");
              return;
            }
          } else {
            // Demo mode - just use local state
            const newEvent: Event = {
              id: `local-event-${Date.now()}`,
              title,
              venue,
              date: dateDisplay,
              time: timeDisplay,
              vibe: vibes,
              image: imageUrl,
              igHandle,
              igUrl: e.igUrl,
              saved: true,
              isDown: true,
              isPublic: sharePublicly,
              peopleDown: [],
            };
            setEvents((prev) => [newEvent, ...prev]);
            setNewlyAddedId(newEvent.id);
            setTimeout(() => setNewlyAddedId(null), 2500);
          }

          setTab("feed");
          setFeedMode("foryou");
          const openAddModalInIdeaMode = () => {
            setAddModalDefaultMode("idea");
            setAddModalOpen(true);
          };
          if (e.type === "movie") {
            showToastWithAction("Movie night saved! Rally friends?", openAddModalInIdeaMode);
          } else {
            showToastWithAction("Event saved! Rally friends?", openAddModalInIdeaMode);
          }
        }}
        onInterestCheck={async (idea, expiresInHours, eventDate, maxSquadSize) => {
          const expiresLabel = expiresInHours == null ? "open" : expiresInHours >= 24 ? "24h" : `${expiresInHours}h`;
          const dateLabel = eventDate ? new Date(eventDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : undefined;
          // Save to database if logged in (not demo mode)
          if (!isDemoMode && userId) {
            try {
              const dbCheck = await db.createInterestCheck(idea, expiresInHours, eventDate, maxSquadSize);
              const newCheck: InterestCheck = {
                id: dbCheck.id,
                text: idea,
                author: profile?.display_name || "You",
                timeAgo: "now",
                expiresIn: expiresLabel,
                expiryPercent: 0,
                responses: [],
                isYours: true,
                maxSquadSize,
                eventDate: eventDate ?? undefined,
                eventDateLabel: dateLabel,
              };
              setChecks((prev) => [newCheck, ...prev]);
              showToast("Sent to friends! 📣");
            } catch (err) {
              console.error("Failed to create interest check:", err);
              showToast("Failed to send - try again");
            }
          } else {
            // Demo mode - local state + simulated responses
            const newCheck: InterestCheck = {
              id: `local-check-${Date.now()}`,
              text: idea,
              author: "You",
              timeAgo: "now",
              expiresIn: expiresLabel,
              expiryPercent: 0,
              responses: [],
              isYours: true,
              maxSquadSize,
              eventDate: eventDate ?? undefined,
              eventDateLabel: dateLabel,
            };
            setChecks((prev) => [newCheck, ...prev]);
            showToast("Sent to friends! 📣");

            // Simulate friends responding (demo mode only)
            setTimeout(() => {
              setChecks((prev) =>
                prev.map((c) =>
                  c.id === newCheck.id
                    ? { ...c, responses: [{ name: "Sara", avatar: "S", status: "down" as const }] }
                    : c
                )
              );
            }, 3000);
            setTimeout(() => {
              setChecks((prev) =>
                prev.map((c) =>
                  c.id === newCheck.id
                    ? {
                        ...c,
                        responses: [
                          ...c.responses,
                          { name: "Nickon", avatar: "N", status: "down" as const },
                        ],
                      }
                    : c
                )
              );
            }, 6000);
          }
        }}
      />
      <EventLobby
        event={socialEvent}
        open={!!socialEvent}
        onClose={() => setSocialEvent(null)}
        onStartSquad={startSquadFromEvent}
        onJoinSquadPool={handleJoinSquadPool}
        squadPoolMembers={squadPoolMembers}
        inSquadPool={inSquadPool}
        isDemoMode={isDemoMode}
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      <NotificationsPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        setNotifications={setNotifications}
        isDemoMode={isDemoMode}
        userId={userId}
        setUnreadCount={setUnreadCount}
        friends={friends}
        onNavigate={(action) => {
          if (action.type === "friends") {
            setFriendsInitialTab(action.tab);
            setFriendsOpen(true);
          } else if (action.type === "groups") {
            setTab("groups");
          } else if (action.type === "feed") {
            setTab("feed");
            setFeedMode("foryou");
          }
        }}
      />

      <EditEventModal
        event={editingEvent}
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        onSave={handleEditEvent}
      />
      <FriendsModal
        open={friendsOpen}
        onClose={() => { setFriendsOpen(false); setFriendsInitialTab("friends"); }}
        initialTab={friendsInitialTab}
        friends={friends}
        suggestions={suggestions}
        onAddFriend={async (id) => {
          const person = suggestions.find((s) => s.id === id);
          if (!person || isDemoMode) {
            // Demo mode - just update local state
            setSuggestions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
            );
            showToast("Friend request sent! 🤝");
            return;
          }

          // Real mode - send to database
          try {
            await db.sendFriendRequest(person.id);
            setSuggestions((prev) =>
              prev.map((s) => (s.id === id ? { ...s, status: "pending" as const } : s))
            );
            showToast("Friend request sent! 🤝");
          } catch (err) {
            console.error("Failed to send friend request:", err);
            showToast("Failed to send request");
          }
        }}
        onAcceptRequest={async (id) => {
          const person = suggestions.find((s) => s.id === id);
          if (!person) return;

          if (!person.friendshipId) {
            // Demo mode - just update local state
            setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
            setSuggestions((prev) => prev.filter((s) => s.id !== id));
            showToast(`${person.name} added! 🎉`);
            return;
          }

          // Real mode - accept in database
          try {
            await db.acceptFriendRequest(person.friendshipId);
            setFriends((prev) => [...prev, { ...person, status: "friend" as const, availability: "open" as const }]);
            setSuggestions((prev) => prev.filter((s) => s.id !== id));
            showToast(`${person.name} added! 🎉`);
            // Refresh events so friend's events appear in For You feed
            loadRealDataRef.current();
          } catch (err) {
            console.error("Failed to accept friend request:", err);
            showToast("Failed to accept request");
          }
        }}
        onRemoveFriend={async (id) => {
          const person = friends.find((f) => f.id === id);
          if (!person) return;

          if (!person.friendshipId) {
            // Demo mode
            setFriends((prev) => prev.filter((f) => f.id !== id));
            showToast(`Removed ${person.name}`);
            return;
          }

          try {
            await db.removeFriend(person.friendshipId);
            setFriends((prev) => prev.filter((f) => f.id !== id));
            showToast(`Removed ${person.name}`);
          } catch (err) {
            console.error("Failed to remove friend:", err);
            showToast("Failed to remove friend");
          }
        }}
        onSearchUsers={!isDemoMode && userId ? async (query) => {
          const results = await db.searchUsers(query);
          const friendIds = new Set(friends.map((f) => f.id));
          const pendingIds = new Set(
            suggestions.filter((s) => s.status === "pending" || s.status === "incoming").map((s) => s.id)
          );

          return results
            .filter((p) => p.id !== userId)
            .map((p) => ({
              id: p.id,
              name: p.display_name,
              username: p.username,
              avatar: p.avatar_letter,
              status: friendIds.has(p.id)
                ? "friend" as const
                : pendingIds.has(p.id)
                  ? "pending" as const
                  : "none" as const,
              availability: p.availability,
              igHandle: p.ig_handle ?? undefined,
            }));
        } : isDemoMode ? async (query) => {
          return DEMO_SEARCH_USERS.filter(u =>
            u.name.toLowerCase().includes(query.toLowerCase()) ||
            u.username.toLowerCase().includes(query.toLowerCase())
          );
        } : undefined}
        onViewProfile={(uid) => setViewingUserId(uid)}
      />
      {viewingUserId && (
        <UserProfileOverlay
          targetUserId={viewingUserId}
          currentUserId={userId}
          onClose={() => setViewingUserId(null)}
          onFriendAction={() => {
            // Reload friends/suggestions after any friend action
            if (!isDemoMode && userId) loadRealData();
          }}
        />
      )}
    </div>
  );
}
