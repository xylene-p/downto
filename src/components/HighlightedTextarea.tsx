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

  // Build highlighted HTML from value + spans
  const buildHighlightedText = () => {
    if (spans.length === 0) {
      return <span>{value || "\u00A0"}</span>;
    }
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) {
        parts.push(<span key={`t${cursor}`}>{value.slice(cursor, span.start)}</span>);
      }
      parts.push(
        <mark
          key={`m${span.start}`}
          style={{
            background: "rgba(232,255,90,0.25)",
            color: "transparent",
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
      parts.push(<span key={`t${cursor}`}>{value.slice(cursor)}</span>);
    }
    // Trailing newline so backdrop sizing matches textarea
    parts.push(<span key="trail">{"\n"}</span>);
    return parts;
  };

  // These must be identical on both backdrop and textarea
  const sharedStyle: CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize ?? 13,
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
      {/* Backdrop with highlights — same size/font as textarea */}
      <div
        ref={backdropRef}
        style={{
          ...sharedStyle,
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          height: "100%",
          color: "transparent",
          pointerEvents: "none",
          overflow: "hidden",
        }}
        aria-hidden
      >
        {buildHighlightedText()}
      </div>
      {/* Actual textarea — transparent bg so highlights show through */}
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
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          background: "transparent",
          color: style.color ?? "#fff",
          outline: "none",
          resize: "none",
          WebkitAppearance: "none",
        }}
      />
    </div>
  );
};

export default HighlightedTextarea;
