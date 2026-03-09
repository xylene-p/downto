"use client";

import { useRef, useCallback, type CSSProperties, type RefObject } from "react";
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
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    const ta = textareaRef?.current;
    const bd = backdropRef.current;
    if (ta && bd) {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    }
  }, [textareaRef]);

  const textColor = style.color ?? "#fff";

  // Build visible text with highlight marks — this is the ONLY visible text layer
  const buildHighlightedText = () => {
    if (!value) return <span>{"\u00A0"}</span>;
    if (spans.length === 0) {
      return <span style={{ color: textColor }}>{value}</span>;
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) {
        parts.push(
          <span key={`t${cursor}`} style={{ color: textColor }}>
            {value.slice(cursor, span.start)}
          </span>
        );
      }
      parts.push(
        <mark
          key={`m${span.start}`}
          style={{
            background: "rgba(232,255,90,0.25)",
            color: textColor,
            borderRadius: 3,
            padding: 0,
            margin: 0,
          }}
        >
          {value.slice(span.start, span.end)}
        </mark>
      );
      cursor = span.end;
    }
    if (cursor < value.length) {
      parts.push(
        <span key={`t${cursor}`} style={{ color: textColor }}>
          {value.slice(cursor)}
        </span>
      );
    }
    parts.push(<span key="trail">{"\n"}</span>);
    return parts;
  };

  // Identical on both layers
  const sharedStyle: CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ?? 13,
    fontWeight: style.fontWeight ?? "normal",
    lineHeight: style.lineHeight ?? 1.5,
    padding: style.padding ?? "14px 16px",
    letterSpacing: style.letterSpacing ?? "normal",
    wordSpacing: style.wordSpacing ?? "normal",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    overflowWrap: "break-word",
    boxSizing: "border-box",
    margin: 0,
    border: "none",
    borderWidth: 0,
    overflow: "hidden",
  };

  return (
    <div
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
      {/* Backdrop — the ONLY visible text layer, with highlight marks */}
      <div
        ref={backdropRef}
        style={{
          ...sharedStyle,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        {buildHighlightedText()}
      </div>
      {/* Textarea — invisible text, only provides input + cursor */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        placeholder={placeholder}
        style={{
          ...sharedStyle,
          zIndex: 1,
          background: "transparent",
          color: "transparent",
          caretColor: textColor,
          outline: "none",
          resize: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          WebkitTextFillColor: "transparent",
        }}
      />
    </div>
  );
};

export default HighlightedTextarea;
