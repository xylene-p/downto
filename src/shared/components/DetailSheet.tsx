"use client";

import React from "react";
import { useBottomSheet } from "@/shared/hooks/useBottomSheet";

/**
 * Shared bottom-sheet shell: backdrop + blur + slide-up panel + drag-to-dismiss
 * + scrollable content + optional "edit" row at the bottom. Consumer renders
 * its own content (hero, metadata, etc.) via children.
 *
 * Parent owns visibility: mount when open, unmount to close. `onClose` is
 * called after the close animation completes so state can be cleared.
 */
export default function DetailSheet({
  onClose,
  editLabel,
  onEdit,
  children,
}: {
  onClose: () => void;
  editLabel?: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  const sheet = useBottomSheet({ open: true, onClose });

  if (!sheet.visible) return null;

  return (
    <div
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[100] flex items-end justify-center"
    >
      {/* Backdrop */}
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
      {/* Panel */}
      <div
        className="relative bg-surface rounded-t-3xl w-full flex flex-col pt-3"
        style={{
          maxWidth: 420,
          maxHeight: "80vh",
          animation: sheet.closing ? undefined : "slideUp 0.3s ease-out",
          transform: sheet.panelTransform,
          transition: sheet.panelTransition,
        }}
      >
        {/* Drag handle */}
        <div {...sheet.swipeProps} className="touch-none">
          <div className="flex justify-center px-5 pb-2">
            <div className="w-10 h-1 bg-faint rounded-sm" />
          </div>
        </div>

        {/* Scrollable content */}
        <div
          {...sheet.scrollProps}
          className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5"
        >
          {children}
          {editLabel && onEdit && (
            <div className="mt-5 pt-4 border-t border-border">
              <button
                onClick={() => { onEdit(); sheet.close(); }}
                className="w-full flex items-center justify-between py-2 font-mono text-xs text-dt font-bold uppercase tracking-[0.06em] cursor-pointer"
              >
                <span>{editLabel}</span>
                <span className="text-faint">→</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
