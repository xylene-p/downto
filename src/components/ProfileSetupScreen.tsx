"use client";

import { useState } from "react";
import * as db from "@/lib/db";
import type { Profile } from "@/lib/types";
import { font, color } from "@/lib/styles";
import GlobalStyles from "./GlobalStyles";
import Grain from "./Grain";
import { logError } from "@/lib/logger";

const ProfileSetupScreen = ({
  profile,
  onComplete,
}: {
  profile: Profile;
  onComplete: (updated: Profile) => void;
}) => {
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [igHandle, setIgHandle] = useState(profile.ig_handle || "");
  const [saving, setSaving] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);

  const handleSave = async () => {
    if (!username || !usernameValid) return;
    setSaving(true);
    setUsernameError(null);
    try {
      const updates: Partial<Profile> = { username };
      if (displayName.trim()) updates.display_name = displayName.trim();
      if (igHandle.trim()) updates.ig_handle = igHandle.trim().replace(/^@/, "");
      const updated = await db.updateProfile(updates);
      onComplete(updated);
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      if (code === '23505') {
        setUsernameError("Username taken");
      } else {
        logError("saveProfile", err, { username });
      }
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const updated = await db.updateProfile({ onboarded: true } as Partial<Profile>);
      onComplete(updated);
    } catch (err) {
      logError("skipSetup", err);
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        background: color.bg,
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        set up
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
        }}
      >
        how should people know you?
      </p>

      {/* Display name */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        display name
      </label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder="your name"
        style={{
          width: "100%",
          padding: "14px 16px",
          background: color.card,
          border: `1px solid ${color.borderMid}`,
          borderRadius: 12,
          color: color.text,
          fontFamily: font.mono,
          fontSize: 14,
          outline: "none",
          marginBottom: 24,
          boxSizing: "border-box",
        }}
      />

      {/* Username */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        username
      </label>
      <input
        type="text"
        value={username}
        onChange={(e) => {
          const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
          setUsername(v);
          setUsernameError(null);
        }}
        placeholder="your_username"
        style={{
          width: "100%",
          padding: "14px 16px",
          background: color.card,
          border: `1px solid ${usernameError ? "#ff4444" : color.borderMid}`,
          borderRadius: 12,
          color: color.text,
          fontFamily: font.mono,
          fontSize: 14,
          outline: "none",
          marginBottom: usernameError ? 4 : (username && !usernameValid ? 4 : 24),
          boxSizing: "border-box",
        }}
      />
      {usernameError && (
        <p style={{ fontFamily: font.mono, fontSize: 11, color: "#ff4444", margin: "0 0 16px 0" }}>
          {usernameError}
        </p>
      )}
      {username && !usernameValid && !usernameError && (
        <p style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, margin: "0 0 16px 0" }}>
          3-20 chars, letters, numbers & underscores
        </p>
      )}

      {/* IG handle */}
      <label
        style={{
          fontFamily: font.mono,
          fontSize: 11,
          color: color.muted,
          marginBottom: 8,
          display: "block",
        }}
      >
        instagram handle (optional)
      </label>
      <div style={{ position: "relative", marginBottom: 40 }}>
        <span
          style={{
            position: "absolute",
            left: 16,
            top: "50%",
            transform: "translateY(-50%)",
            fontFamily: font.mono,
            fontSize: 14,
            color: color.dim,
          }}
        >
          @
        </span>
        <input
          type="text"
          value={igHandle}
          onChange={(e) => setIgHandle(e.target.value.replace(/^@/, ""))}
          placeholder="yourhandle"
          style={{
            width: "100%",
            padding: "14px 16px 14px 32px",
            background: color.card,
            border: `1px solid ${color.borderMid}`,
            borderRadius: 12,
            color: color.text,
            fontFamily: font.mono,
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Let's go button */}
      <button
        onClick={handleSave}
        disabled={saving || !usernameValid}
        style={{
          width: "100%",
          padding: "16px",
          background: usernameValid ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: usernameValid ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: saving || !usernameValid ? "default" : "pointer",
          opacity: saving ? 0.6 : 1,
          marginBottom: 16,
        }}
      >
        {saving ? "saving..." : "let's go"}
      </button>

      {/* Skip link */}
      <button
        onClick={handleSkip}
        disabled={saving}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 12,
          cursor: "pointer",
          textDecoration: "underline",
          alignSelf: "center",
        }}
      >
        skip for now
      </button>
    </div>
  );
};

export default ProfileSetupScreen;
