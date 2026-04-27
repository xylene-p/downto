"use client";

import { useBottomSheet } from "@/shared/hooks/useBottomSheet";

/**
 * Small action sheet for a non-owned check in the feed. Opens from the
 * card's ⋯ kebab. Surfaces Hide + Report in a bottom sheet so the card
 * itself stays visually quiet.
 */
interface CheckActionsSheetProps {
  onHide: () => void;
  onReport: () => void;
  onClose: () => void;
}

const CheckActionsSheet = ({ onHide, onReport, onClose }: CheckActionsSheetProps) => {
  const sheet = useBottomSheet({ open: true, onClose });

  if (!sheet.visible) return null;

  const actOn = (fn: () => void) => {
    fn();
    sheet.close();
  };

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
          animation: sheet.closing ? undefined : "slideUp 0.3s ease-out",
          transform: sheet.panelTransform,
          transition: sheet.panelTransition,
        }}
      >
        <div {...sheet.swipeProps} className="touch-none pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-sm" style={{ background: "#444" }} />
        </div>

        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button
            onClick={() => actOn(onHide)}
            className="w-full bg-card border border-border-mid rounded-xl py-3.5 font-mono text-xs font-bold uppercase text-primary cursor-pointer"
            style={{ letterSpacing: "0.08em" }}
          >
            Hide this check
          </button>
          <button
            onClick={() => actOn(onReport)}
            className="w-full bg-card border border-border-mid rounded-xl py-3.5 font-mono text-xs font-bold uppercase text-primary cursor-pointer"
            style={{ letterSpacing: "0.08em" }}
          >
            Report
          </button>
          <button
            onClick={sheet.close}
            className="w-full bg-transparent border-none rounded-xl py-3 font-mono text-xs uppercase text-faint cursor-pointer mt-1"
            style={{ letterSpacing: "0.08em" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckActionsSheet;
