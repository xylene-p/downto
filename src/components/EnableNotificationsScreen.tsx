"use client";

import { useState } from "react";
import { font, color } from "@/lib/styles";
import {
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
} from "@/lib/pushNotifications";
import GlobalStyles from "./GlobalStyles";
import Grain from "./Grain";

function isIOSNotStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return isIOS && !isStandalone;
}

const EnableNotificationsScreen = ({
  onComplete,
}: {
  onComplete: (enabled: boolean) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const supported = isPushSupported();
  const iosNeedsPWA = !supported && isIOSNotStandalone();

  const handleEnable = async () => {
    setLoading(true);
    try {
      const reg = await registerServiceWorker();
      if (!reg) {
        onComplete(false);
        return;
      }
      const sub = await subscribeToPush(reg);
      onComplete(!!sub);
    } catch {
      onComplete(false);
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
          lineHeight: 1.1,
        }}
      >
        stay in the loop
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.dim,
          marginBottom: 40,
          lineHeight: 1.6,
        }}
      >
        get notified when friends send you a check, accept your request, or when your squad is formed
      </p>

      <button
        onClick={handleEnable}
        disabled={loading || !supported}
        style={{
          width: "100%",
          padding: "16px",
          background: supported ? color.accent : color.borderMid,
          border: "none",
          borderRadius: 12,
          color: supported ? color.bg : color.dim,
          fontFamily: font.mono,
          fontSize: 14,
          fontWeight: 700,
          cursor: supported ? "pointer" : "default",
          marginBottom: 16,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading
          ? "enabling..."
          : supported
            ? "enable notifications"
            : iosNeedsPWA
              ? "add to home screen first"
              : "notifications not supported"}
      </button>

      {iosNeedsPWA && (
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 11,
            color: color.dim,
            textAlign: "center",
            lineHeight: 1.6,
            marginBottom: 16,
            marginTop: 0,
          }}
        >
          tap{" "}
          <span style={{ fontSize: 14, verticalAlign: "middle" }}>
            {/* Safari share icon */}
            &#x1F4E4;
          </span>{" "}
          then &quot;Add to Home Screen&quot; to enable push notifications on iOS
        </p>
      )}

      <button
        onClick={() => onComplete(false)}
        style={{
          background: "transparent",
          border: "none",
          color: color.dim,
          fontFamily: font.mono,
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "center",
        }}
      >
        skip for now
      </button>
    </div>
  );
};

export default EnableNotificationsScreen;
