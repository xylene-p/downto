"use client";

import { useRef, useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";
import type { TextSpan } from "@/lib/utils";

interface HighlightedTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  spans: TextSpan[];
  placeholder?: string;
  maxLength?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  background?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  style?: CSSProperties;
}

/**
 * Textarea with inline highlighting using character-position measurement.
 * Instead of the fragile backdrop-overlay technique (where textarea and div
 * render fonts differently), this measures actual character positions in a
 * monospace font and places highlight rectangles at exact pixel coordinates.
 */
const HighlightedTextarea = ({
  value,
  onChange,
  spans,
  placeholder,
  maxLength,
  textareaRef,
  background = "transparent",
  onKeyDown,
  style = {},
}: HighlightedTextareaProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [charMetrics, setCharMetrics] = useState<{ w: number; h: number } | null>(null);
  const [innerWidth, setInnerWidth] = useState(0);

  const padding = style.padding ?? "14px 16px";
  const fontSize = style.fontSize ?? 13;
  const lineHeight = style.lineHeight ?? 1.5;
  const fontFamily = style.fontFamily ?? "monospace";

  // Parse padding to get left padding value
  const parsePadding = (p: string | number) => {
    if (typeof p === "number") return { top: p, left: p };
    const parts = p.split(" ").map((s) => parseInt(s));
    if (parts.length === 1) return { top: parts[0], left: parts[0] };
    if (parts.length === 2) return { top: parts[0], left: parts[1] };
    if (parts.length === 4) return { top: parts[0], left: parts[3] };
    return { top: parts[0], left: parts[1] };
  };
  const pad = parsePadding(padding);

  // Measure character width/height on mount and when font changes
  useEffect(() => {
    const measure = () => {
      const span = measureRef.current;
      const container = containerRef.current;
      if (!span || !container) return;
      const rect = span.getBoundingClientRect();
      setCharMetrics({ w: rect.width / 10, h: rect.height }); // span has 10 chars
      // Inner width = container width minus horizontal padding and border
      const cs = getComputedStyle(container);
      const bw = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      setInnerWidth(container.getBoundingClientRect().width - pad.left * 2 - bw);
    };
    // Wait for fonts to load
    if (document.fonts?.ready) {
      document.fonts.ready.then(measure);
    } else {
      measure();
    }
    // Also measure on resize
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fontSize, fontFamily, pad.left]);

  // Calculate highlight rectangles from character metrics
  const getHighlightRects = () => {
    if (!charMetrics || innerWidth <= 0 || spans.length === 0) return [];
    const charsPerLine = Math.floor(innerWidth / charMetrics.w);
    if (charsPerLine <= 0) return [];
    const lineH = typeof lineHeight === "number"
      ? lineHeight * (typeof fontSize === "number" ? fontSize : 13)
      : parseFloat(String(lineHeight));

    // Build a map of line breaks from word wrapping
    const lines = getWrappedLines(value, charsPerLine);

    const rects: { x: number; y: number; w: number; h: number; key: string }[] = [];

    for (const span of spans) {
      // Find which wrapped line each char index falls on
      let spanStart = span.start;
      const spanEnd = span.end;

      for (let li = 0; li < lines.length && spanStart < spanEnd; li++) {
        const lineStart = lines[li].start;
        const lineEnd = lines[li].end;
        // Does this span overlap this line?
        if (spanStart < lineEnd && spanEnd > lineStart) {
          const highlightStart = Math.max(spanStart, lineStart);
          const highlightEnd = Math.min(spanEnd, lineEnd);
          const col = highlightStart - lineStart;
          rects.push({
            x: pad.left + col * charMetrics.w,
            y: pad.top + li * lineH,
            w: (highlightEnd - highlightStart) * charMetrics.w,
            h: lineH,
            key: `${span.start}-${li}`,
          });
        }
      }
    }
    return rects;
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: style.width ?? "100%",
        height: style.height ?? 100,
        background,
        border: style.border ?? "none",
        borderRadius: style.borderRadius ?? 12,
        overflow: "hidden",
      }}
    >
      {/* Hidden span to measure monospace character width */}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          fontFamily,
          fontSize,
          lineHeight,
          letterSpacing: "normal",
          pointerEvents: "none",
        }}
      >
        {"MMMMMMMMMM"}
      </span>
      {/* Highlight rectangles positioned at exact character coordinates */}
      {getHighlightRects().map((r) => (
        <div
          key={r.key}
          style={{
            position: "absolute",
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: "rgba(232,255,90,0.25)",
            borderRadius: 3,
            pointerEvents: "none",
          }}
        />
      ))}
      {/* Regular textarea — no transparency tricks, cursor works normally */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          fontFamily,
          fontSize,
          lineHeight,
          padding,
          letterSpacing: "normal",
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          overflowWrap: "break-word",
          boxSizing: "border-box",
          margin: 0,
          border: "none",
          background: "transparent",
          color: style.color ?? "#fff",
          outline: "none",
          resize: "none",
          WebkitAppearance: "none",
          zIndex: 1,
        }}
      />
    </div>
  );
};

/** Compute wrapped line ranges for pre-wrap word-wrapping */
function getWrappedLines(text: string, charsPerLine: number): { start: number; end: number }[] {
  if (!text) return [{ start: 0, end: 0 }];
  const lines: { start: number; end: number }[] = [];
  let i = 0;

  while (i < text.length) {
    // Check for explicit newline
    const nlIdx = text.indexOf("\n", i);
    const lineText = nlIdx >= 0 ? text.slice(i, nlIdx) : text.slice(i);

    if (lineText.length <= charsPerLine) {
      // Fits on one line
      const end = nlIdx >= 0 ? nlIdx + 1 : text.length;
      lines.push({ start: i, end });
      i = end;
    } else {
      // Need to wrap — find last space within charsPerLine
      let breakAt = -1;
      for (let j = i + charsPerLine; j > i; j--) {
        if (text[j] === " ") {
          breakAt = j;
          break;
        }
      }
      if (breakAt <= i) {
        // No space found — break at charsPerLine (overflow-wrap: break-word)
        breakAt = i + charsPerLine;
      }
      lines.push({ start: i, end: breakAt });
      // Skip the space at the break point
      i = text[breakAt] === " " ? breakAt + 1 : breakAt;
    }
  }

  if (lines.length === 0) lines.push({ start: 0, end: 0 });
  return lines;
}

export default HighlightedTextarea;
