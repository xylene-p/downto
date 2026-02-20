"use client";

import { useState } from "react";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import type { Friend, AvailabilityStatus } from "@/lib/ui-types";
import { AVAILABILITY_OPTIONS, EXPIRY_OPTIONS } from "@/lib/ui-types";

const ProfileView = ({
  friends,
  onOpenFriends,
  onLogout,
  profile,
  pushEnabled,
  pushSupported,
  onTogglePush,
  onAvailabilityChange,
  onUpdateProfile,
  showToast,
}: {
  friends: Friend[];
  onOpenFriends: () => void;
  onLogout: () => void;
  profile?: Profile | null;
  pushEnabled: boolean;
  pushSupported: boolean;
  onTogglePush: () => void;
  onAvailabilityChange?: (status: AvailabilityStatus) => void;
  onUpdateProfile?: (updates: Partial<Profile>) => Promise<void>;
  showToast?: (msg: string) => void;
}) => {
  const [availability, setAvailability] = useState<AvailabilityStatus>(
    profile?.availability ?? "open"
  );
  const [expiry, setExpiry] = useState<string | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customExpiry, setCustomExpiry] = useState("");
  const [pendingStatus, setPendingStatus] = useState<AvailabilityStatus | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const handleStatusSelect = (status: AvailabilityStatus) => {
    if (status === "open") {
      setAvailability("open");
      setExpiry(null);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.("open");
    } else {
      setPendingStatus(status);
      setShowExpiryPicker(true);
      setShowCustomInput(false);
    }
  };

  const handleExpirySelect = (exp: string) => {
    if (exp === "custom") {
      setShowCustomInput(true);
      return;
    }
    if (pendingStatus) {
      setAvailability(pendingStatus);
      setExpiry(exp === "none" ? null : exp);
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
    }
  };

  const handleCustomExpirySubmit = () => {
    if (pendingStatus && customExpiry.trim()) {
      setAvailability(pendingStatus);
      setExpiry(customExpiry.trim());
      setShowExpiryPicker(false);
      setShowCustomInput(false);
      onAvailabilityChange?.(pendingStatus);
      setPendingStatus(null);
      setCustomExpiry("");
    }
  };

  const handleNameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !onUpdateProfile) return;
    try {
      await onUpdateProfile({ display_name: trimmed });
      setEditingName(false);
    } catch {
      showToast?.("Failed to update name");
    }
  };

  const displayName = profile?.display_name ?? "kat";
  const avatarLetter = profile?.avatar_letter ?? displayName.charAt(0).toUpperCase();

  return (
  <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
    <div style={{ textAlign: "center", paddingTop: 20 }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: color.accent,
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.mono,
          fontSize: 28,
          fontWeight: 700,
          margin: "0 auto 12px",
        }}
      >
        {avatarLetter}
      </div>
      {editingName ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", marginTop: 4 }}>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => {
              if (e.target.value.length <= 30) setNameInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNameSave();
              if (e.key === "Escape") setEditingName(false);
            }}
            autoFocus
            style={{
              background: color.deep,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "8px 12px",
              fontFamily: font.serif,
              fontSize: 20,
              color: color.text,
              outline: "none",
              width: 160,
              textAlign: "center",
            }}
          />
          <button
            onClick={handleNameSave}
            disabled={!nameInput.trim()}
            style={{
              background: nameInput.trim() ? color.accent : color.borderMid,
              color: nameInput.trim() ? "#000" : color.dim,
              border: "none",
              borderRadius: 10,
              padding: "8px 14px",
              fontFamily: font.mono,
              fontSize: 12,
              fontWeight: 700,
              cursor: nameInput.trim() ? "pointer" : "not-allowed",
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditingName(false)}
            style={{
              background: "transparent",
              border: "none",
              fontFamily: font.mono,
              fontSize: 11,
              color: color.faint,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <h2
          onClick={() => {
            if (onUpdateProfile) {
              setNameInput(displayName);
              setEditingName(true);
            }
          }}
          style={{
            fontFamily: font.serif,
            fontSize: 24,
            color: color.text,
            fontWeight: 400,
            cursor: onUpdateProfile ? "pointer" : "default",
          }}
        >
          {displayName}
          {onUpdateProfile && (
            <span style={{ fontSize: 12, color: color.faint, marginLeft: 6 }}>✎</span>
          )}
        </h2>
      )}
      <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginTop: 4 }}>
        @{profile?.username ?? "you"}
      </p>
      {profile?.username && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(`https://downto.xyz?add=${profile.username}`);
            showToast?.("Link copied!");
          }}
          style={{
            marginTop: 10,
            background: "transparent",
            border: `1px solid ${color.borderMid}`,
            borderRadius: 20,
            padding: "6px 14px",
            fontFamily: font.mono,
            fontSize: 11,
            color: color.muted,
            cursor: "pointer",
          }}
        >
          copy my link
        </button>
      )}
    </div>

    {/* Friends */}
    <button
      onClick={onOpenFriends}
      style={{
        width: "100%",
        marginTop: 24,
        background: color.card,
        border: `1px solid ${color.border}`,
        borderRadius: 16,
        padding: "14px 16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex" }}>
          {friends.slice(0, 4).map((f, i) => (
            <div
              key={f.id}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: color.accent,
                color: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 12,
                fontWeight: 700,
                marginLeft: i > 0 ? -10 : 0,
                border: `2px solid ${color.card}`,
              }}
            >
              {f.avatar}
            </div>
          ))}
        </div>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text }}>
          {friends.length} friends
        </span>
      </div>
      <span style={{ color: color.dim, fontSize: 14 }}>→</span>
    </button>

    {/* Availability Meter */}
    <div
      style={{
        marginTop: 24,
        background: color.card,
        borderRadius: 16,
        padding: 16,
        border: `1px solid ${color.border}`,
      }}
    >
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.dim,
          marginBottom: 14,
        }}
      >
        Right now
      </div>
      {!showExpiryPicker ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AVAILABILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleStatusSelect(option.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  background: availability === option.value ? `${option.color}15` : "transparent",
                  border: `1px solid ${availability === option.value ? option.color : color.borderMid}`,
                  borderRadius: 12,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: 18 }}>{option.emoji}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: 12,
                      color: availability === option.value ? option.color : color.muted,
                      fontWeight: availability === option.value ? 700 : 400,
                    }}
                  >
                    {option.label}
                  </span>
                  {availability === option.value && expiry && (
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: 10,
                        color: color.dim,
                        marginLeft: 8,
                      }}
                    >
                      · expires in {expiry}
                    </span>
                  )}
                </div>
                {availability === option.value && (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: option.color,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              color: color.faint,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            friends can see this on your profile
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              fontFamily: font.serif,
              fontSize: 18,
              color: color.text,
              marginBottom: 4,
            }}
          >
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.emoji}{" "}
            {AVAILABILITY_OPTIONS.find((o) => o.value === pendingStatus)?.label}
          </div>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 11,
              color: color.dim,
              marginBottom: 16,
            }}
          >
            {showCustomInput ? "Enter expiration" : "How long?"}
          </p>
          {!showCustomInput ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleExpirySelect(opt.value)}
                  style={{
                    background: color.surface,
                    border: `1px solid ${color.borderMid}`,
                    borderRadius: 20,
                    padding: "8px 14px",
                    fontFamily: font.mono,
                    fontSize: 11,
                    color: color.muted,
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={customExpiry}
                onChange={(e) => setCustomExpiry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomExpirySubmit()}
                placeholder="e.g., 3 hours, 6pm, Friday"
                autoFocus
                style={{
                  flex: 1,
                  background: color.deep,
                  border: `1px solid ${color.borderMid}`,
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  color: color.text,
                  outline: "none",
                }}
              />
              <button
                onClick={handleCustomExpirySubmit}
                disabled={!customExpiry.trim()}
                style={{
                  background: customExpiry.trim() ? color.accent : color.borderMid,
                  color: customExpiry.trim() ? "#000" : color.dim,
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: customExpiry.trim() ? "pointer" : "not-allowed",
                }}
              >
                Set
              </button>
            </div>
          )}
          <button
            onClick={() => {
              setShowExpiryPicker(false);
              setShowCustomInput(false);
              setPendingStatus(null);
              setCustomExpiry("");
            }}
            style={{
              marginTop: 14,
              background: "transparent",
              border: "none",
              fontFamily: font.mono,
              fontSize: 11,
              color: color.faint,
              cursor: "pointer",
            }}
          >
            ← cancel
          </button>
        </>
      )}
    </div>

    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Your vibes
      </div>
      {["techno", "ambient", "house", "photography", "late night", "community"].map((v) => (
        <span
          key={v}
          style={{
            display: "inline-block",
            background: color.card,
            color: color.muted,
            padding: "8px 14px",
            borderRadius: 20,
            fontFamily: font.mono,
            fontSize: 11,
            margin: "0 6px 8px 0",
            border: `1px solid ${color.border}`,
          }}
        >
          {v}
        </span>
      ))}
    </div>

    <div style={{ marginTop: 32 }}>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          color: color.faint,
          marginBottom: 16,
        }}
      >
        Settings
      </div>
      {profile?.ig_handle && (
        <div
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Instagram</span>
          <span style={{ color: color.dim, fontSize: 11 }}>@{profile.ig_handle}</span>
        </div>
      )}
      {pushSupported && (
        <div
          onClick={onTogglePush}
          style={{
            padding: "14px 0",
            borderBottom: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: 12,
            color: color.muted,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
        >
          <span>Push Notifications</span>
          <span style={{ color: pushEnabled ? color.accent : color.borderMid, fontSize: 11 }}>
            {pushEnabled ? "✓ Enabled" : "Enable →"}
          </span>
        </div>
      )}
      {["Calendar Sync (Google/Apple)", "Privacy & Visibility"].map(
        (s) => (
          <div
            key={s}
            style={{
              padding: "14px 0",
              borderBottom: `1px solid ${color.border}`,
              fontFamily: font.mono,
              fontSize: 12,
              color: color.muted,
              display: "flex",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            {s}
            <span style={{ color: color.borderMid }}>→</span>
          </div>
        )
      )}
      <div
        onClick={onLogout}
        style={{
          padding: "14px 0",
          fontFamily: font.mono,
          fontSize: 12,
          color: "#ff6b6b",
          display: "flex",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <span>Log out</span>
        <span style={{ color: "#ff6b6b" }}>→</span>
      </div>
    </div>
  </div>
  );
};

export default ProfileView;
