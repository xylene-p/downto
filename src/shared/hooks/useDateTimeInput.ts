"use client";

import { useState } from "react";
import { parseNaturalDate, parseNaturalTime } from "@/lib/utils";

/**
 * "When" input for natural-language date+time entry. Three modals
 * (EditCheckModal, EditEventModal, CreateModal) used to reimplement the
 * exact same parse-as-you-type + preview logic verbatim — now they all
 * share this.
 *
 * Returns the controlled input value, the setter, the parsed pieces (or
 * null if unparseable), and a "preview" string ("Sat Apr 27 · 7pm") that
 * the modals show under the input as live feedback.
 */
export function useDateTimeInput(initial = "") {
  const [whenInput, setWhenInput] = useState(initial);

  const parsedDate = whenInput ? parseNaturalDate(whenInput) : null;
  const parsedTime = whenInput ? parseNaturalTime(whenInput) : null;

  const whenPreview = (() => {
    if (!parsedDate && !parsedTime) return null;
    const parts: string[] = [];
    if (parsedDate) parts.push(parsedDate.label);
    if (parsedTime) parts.push(parsedTime);
    return parts.join(" ");
  })();

  return { whenInput, setWhenInput, parsedDate, parsedTime, whenPreview };
}
