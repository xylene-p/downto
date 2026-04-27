"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { useModalTransition } from "./useModalTransition";

const SWIPE_DISMISS_THRESHOLD_PX = 60;

/**
 * Bottom-sheet shell behavior in one place. Composes the open → entering →
 * closing → unmounted lifecycle from useModalTransition with the
 * swipe-to-dismiss + scroll-edge-drag logic that every sheet in this app
 * had to reimplement.
 *
 * Returns:
 *   • lifecycle flags from useModalTransition (visible, entering, closing,
 *     close())
 *   • props to spread onto the drag handle (`swipeProps`) and the
 *     scrollable content (`scrollProps`)
 *   • derived style values for the panel and backdrop, so consumers don't
 *     have to recompute the transform/transition/blur strings themselves
 *
 * Sheet shells differ enough (max-height, padding, optional edit row,
 * additional state) that a *hook* is the right shape rather than another
 * wrapping component — `DetailSheet` is already the opinionated wrapper for
 * the cases it covers, and this hook serves everything else.
 */
export function useBottomSheet({
  open,
  onClose,
  closeDuration = 200,
  canClose,
}: {
  open: boolean;
  onClose: () => void;
  closeDuration?: number;
  /**
   * Optional gate on dismissal. Returns false to suppress close (the swipe
   * still resets the drag offset, the backdrop just bounces back). Used by
   * onboarding-style sheets that need the user to take an action before
   * they can dismiss.
   */
  canClose?: () => boolean;
}) {
  const { visible, entering, closing, close } = useModalTransition(
    open,
    onClose,
    closeDuration,
  );

  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Lock body scroll while the sheet is mounted.
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  const finishSwipe = () => {
    if (
      dragOffset > SWIPE_DISMISS_THRESHOLD_PX &&
      (canClose === undefined || canClose())
    ) {
      close();
    }
    setDragOffset(0);
    isDragging.current = false;
  };

  // Spread these onto the drag-handle (or any element that should always
  // start a swipe regardless of scroll position).
  const swipeProps = {
    onTouchStart: (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      isDragging.current = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        isDragging.current = true;
        setDragOffset(dy);
      }
    },
    onTouchEnd: finishSwipe,
  };

  // Spread these onto the scrollable content area. Dragging only initiates
  // a dismiss when the scroll is already at the top — otherwise the user is
  // scrolling content, not closing the sheet.
  const scrollProps = {
    ref: scrollRef,
    onTouchStart: (e: React.TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      isDragging.current = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const dy = e.touches[0].clientY - touchStartY.current;
      const atTop = scrollRef.current ? scrollRef.current.scrollTop <= 0 : true;
      if (atTop && dy > 0) {
        isDragging.current = true;
        e.preventDefault();
        setDragOffset(dy);
      }
    },
    onTouchEnd: () => {
      if (isDragging.current) finishSwipe();
    },
  };

  const panelTransform = closing
    ? "translateY(100%)"
    : `translateY(${dragOffset}px)`;
  const panelTransition = closing
    ? "transform 0.2s ease-in"
    : dragOffset === 0
      ? "transform 0.2s ease-out"
      : "none";
  const backdropBlur = entering || closing ? "blur(0px)" : "blur(8px)";
  const backdropOpacity = entering || closing ? 0 : 1;

  return {
    visible,
    entering,
    closing,
    close,
    dragOffset,
    swipeProps,
    scrollProps,
    panelTransform,
    panelTransition,
    backdropBlur,
    backdropOpacity,
  };
}
