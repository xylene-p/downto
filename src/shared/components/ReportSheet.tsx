"use client";

import { useState } from "react";
import * as db from "@/lib/db";
import type { ReportReason, ReportTargetType } from "@/lib/db";
import { logError } from "@/lib/logger";
import cn from "@/lib/tailwindMerge";
import { useBottomSheet } from "@/shared/hooks/useBottomSheet";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment",    label: "Harassment or bullying" },
  { value: "spam",          label: "Spam" },
  { value: "impersonation", label: "Impersonation" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "threats",       label: "Threats or violence" },
  { value: "other",         label: "Something else" },
];

interface ReportSheetProps {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const ReportSheet = ({ targetType, targetId, targetLabel, onClose, onSubmitted }: ReportSheetProps) => {
  const sheet = useBottomSheet({ open: true, onClose });
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await db.reportContent(targetType, targetId, reason, details.trim() || null);
      onSubmitted?.();
      sheet.close();
    } catch (err) {
      logError("reportContent", err, { targetType, targetId });
      setSubmitting(false);
    }
  };

  if (!sheet.visible) return null;

  const title = targetLabel ? `Report ${targetLabel}` : "Report";

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      <div
        onClick={sheet.close}
        className="absolute inset-0 transition-[opacity,backdrop-filter] duration-300 ease-in-out"
        style={{
          background: "rgba(0,0,0,0.7)",
          backdropFilter: sheet.backdropBlur,
          WebkitBackdropFilter: sheet.backdropBlur,
          opacity: sheet.backdropOpacity,
        }}
      />
      <div
        className="relative bg-surface w-full max-w-[420px] flex flex-col"
        style={{
          borderRadius: "24px 24px 0 0",
          maxHeight: "80vh",
          animation: sheet.closing ? undefined : "slideUp 0.3s ease-out",
          transform: sheet.panelTransform,
          transition: sheet.panelTransition,
        }}
      >
        {/* Drag handle — touch target for swipe-to-dismiss */}
        <div {...sheet.swipeProps} className="touch-none pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-sm" style={{ background: "#444" }} />
        </div>

        <div className="px-6 pb-8 overflow-y-auto flex flex-col">
          <h2 className="font-serif text-[22px] text-primary mb-4">{title}</h2>

          <div className="font-mono text-tiny uppercase text-dim mb-2" style={{ letterSpacing: "0.15em" }}>
            Reason
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            {REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={cn(
                  "text-left rounded-lg py-2.5 px-3 font-mono text-xs border cursor-pointer transition-colors",
                  reason === r.value
                    ? "bg-dt text-on-accent border-dt font-bold"
                    : "bg-card text-primary border-border-mid"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="font-mono text-tiny uppercase text-dim mb-2" style={{ letterSpacing: "0.15em" }}>
            Details <span className="lowercase text-faint normal-case">(optional)</span>
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="Anything else we should know?"
            className="w-full bg-card border border-border-mid rounded-xl py-2.5 px-3 text-primary font-mono text-xs outline-none resize-none mb-5 box-border"
            style={{ height: 72 }}
          />

          <div className="flex gap-2.5">
            <button
              onClick={sheet.close}
              disabled={submitting}
              className="flex-1 bg-transparent border border-border-mid rounded-xl py-3 font-mono text-xs font-bold uppercase text-primary cursor-pointer"
              style={{ letterSpacing: "0.08em" }}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!reason || submitting}
              className={cn(
                "flex-1 border-none rounded-xl py-3 font-mono text-xs font-bold uppercase",
                reason && !submitting
                  ? "bg-dt text-on-accent cursor-pointer"
                  : "bg-border-mid text-dim cursor-not-allowed"
              )}
              style={{ letterSpacing: "0.08em" }}
            >
              {submitting ? "Sending..." : "Submit report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportSheet;
