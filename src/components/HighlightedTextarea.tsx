"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties, type RefObject } from "react";
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
 * Textarea with inline highlighting using CSS background-image gradients.
 * Uses ch units for positioning and measures charsPerLine from a textarea
 * clone (not a span) to ensure wrapping matches across screen sizes.
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
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const [charsPerLine, setCharsPerLine] = useState(999);

  const lineHeight = style.lineHeight ?? 1.5;

  // Measure charsPerLine using a CLONE TEXTAREA — guarantees wrapping matches
  const measureCharsPerLine = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;

    const clone = ta.cloneNode(true) as HTMLTextAreaElement;
    clone.style.position = "fixed";
    clone.style.left = "-9999px";
    clone.style.top = "0";
    clone.style.height = "auto";
    clone.style.minHeight = "0";
    clone.style.maxHeight = "none";
    clone.style.overflow = "hidden";
    clone.style.visibility = "hidden";
    document.body.appendChild(clone);

    // Get single-line height
    clone.value = "x";
    const oneLineH = clone.scrollHeight;

    // Binary search: find max chars that fit on one line
    let lo = 1;
    let hi = 200;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      clone.value = "x".repeat(mid);
      if (clone.scrollHeight > oneLineH) {
        hi = mid - 1;
      } else {
        lo = mid;
      }
    }

    document.body.removeChild(clone);
    setCharsPerLine(lo);
  }, [ref]);

  useEffect(() => {
    const run = () => measureCharsPerLine();
    if (document.fonts?.ready) {
      document.fonts.ready.then(run);
    } else {
      run();
    }
    const ro = new ResizeObserver(run);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measureCharsPerLine]);

  // Build CSS background layers for highlights
  const bgImages: string[] = [];
  const bgSizes: string[] = [];
  const bgPositions: string[] = [];

  if (spans.length > 0 && charsPerLine < 999) {
    const lines = getWrappedLines(value, charsPerLine);
    const lh =
      typeof lineHeight === "number"
        ? lineHeight
        : parseFloat(String(lineHeight));

    for (const span of spans) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        if (span.start >= line.end || span.end <= line.start) continue;
        const hStart = Math.max(span.start, line.start);
        const hEnd = Math.min(span.end, line.end);
        const col = hStart - line.start;
        const count = hEnd - hStart;

        bgImages.push(
          "linear-gradient(rgba(232,255,90,0.25),rgba(232,255,90,0.25))"
        );
        bgSizes.push(`${count}ch ${lh}em`);
        bgPositions.push(`${col}ch ${li * lh}em`);
      }
    }
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      maxLength={maxLength}
      placeholder={placeholder}
      style={{
        width: style.width ?? "100%",
        height: style.height ?? 100,
        fontFamily: style.fontFamily ?? "monospace",
        fontSize: style.fontSize ?? 13,
        lineHeight,
        padding: style.padding ?? "14px 16px",
        letterSpacing: "normal",
        whiteSpace: "pre-wrap",
        wordWrap: "break-word",
        overflowWrap: "break-word",
        boxSizing: "border-box",
        border: style.border ?? "none",
        borderRadius: style.borderRadius ?? 12,
        color: style.color ?? "#fff",
        backgroundColor: background,
        backgroundImage: bgImages.length > 0 ? bgImages.join(", ") : "none",
        backgroundSize: bgSizes.join(", ") || "auto",
        backgroundPosition: bgPositions.join(", ") || "0 0",
        backgroundRepeat: "no-repeat",
        backgroundOrigin: "content-box",
        outline: "none",
        resize: "none",
        margin: 0,
        WebkitAppearance: "none",
      }}
    />
  );
};

/** Compute wrapped line ranges for pre-wrap word-wrapping */
function getWrappedLines(
  text: string,
  charsPerLine: number
): { start: number; end: number }[] {
  if (!text) return [{ start: 0, end: 0 }];
  const lines: { start: number; end: number }[] = [];
  let i = 0;

  while (i < text.length) {
    const nlIdx = text.indexOf("\n", i);
    const lineText = nlIdx >= 0 ? text.slice(i, nlIdx) : text.slice(i);

    if (lineText.length <= charsPerLine) {
      const end = nlIdx >= 0 ? nlIdx + 1 : text.length;
      lines.push({ start: i, end });
      i = end;
    } else {
      // Find last space within charsPerLine to break at a word boundary
      let breakAt = -1;
      for (let j = i + charsPerLine; j > i; j--) {
        if (text[j] === " ") {
          breakAt = j;
          break;
        }
      }
      if (breakAt <= i) {
        // No space found — force break at charsPerLine
        breakAt = i + charsPerLine;
      }
      lines.push({ start: i, end: breakAt });
      // Skip the space at the break point (it's consumed by the line break)
      i = text[breakAt] === " " ? breakAt + 1 : breakAt;
    }
  }

  if (lines.length === 0) lines.push({ start: 0, end: 0 });
  return lines;
}

export default HighlightedTextarea;
