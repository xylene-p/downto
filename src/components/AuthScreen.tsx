"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";
import GlobalStyles from "./GlobalStyles";
import Grain from "./Grain";
import Button from "./Button";

const AuthScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [pendingAddUser, setPendingAddUser] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("pendingAddUsername");
    if (stored) setPendingAddUser(stored);
  }, []);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
  };

  const handleVerifyCode = async () => {
    if (otp.length !== 8) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      onLogin();
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        margin: "0 auto",
        minHeight: "100vh",
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <GlobalStyles />
      <Grain />

      <h1
        style={{
          marginBottom: 8,
        }}
      >
        down to
      </h1>
      <h2
        style={{
          marginBottom: pendingAddUser ? 12 : 48,
        }}
      >
        from idea to squad in 10 seconds
      </h2>
      {pendingAddUser && (
        <p
          style={{
            color: color.accent,
            marginBottom: 36,
          }}
        >
          log in or create a profile to add @{pendingAddUser}
        </p>
      )}

      {error && (
        <p
          style={{
            color: "#ff6b6b",
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      {step === "email" ? (
        <>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            placeholder="you@email.com"
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 18,
              outline: "none",
              marginBottom: 16,
            }}
          />
          <Button
            onClick={handleSendCode}
            disabled={!email.includes("@") || loading}
            size='large'
          >
            {loading ? "Sending..." : "Send Code"}
          </Button>
        </>
      ) : (
        <>
          <p
            style={{
              marginBottom: 20,
            }}
          >
            We sent a code to
            <br />
            <span style={{ color: color.accent }}>{email}</span>
          </p>
          <label>Code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
            placeholder="00000000"
            autoFocus
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 24,
              letterSpacing: "0.3em",
              textAlign: "center",
              outline: "none",
              marginBottom: 16,
            }}
          />
          <div
            style={{
              marginBottom: 12,
            }}
          >
            <Button
              onClick={handleVerifyCode}
              disabled={otp.length !== 8 || loading}
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <button
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Different email
            </button>
            <button
              onClick={() => {
                setOtp("");
                setError(null);
                handleSendCode();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Resend code
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AuthScreen;
