"use client";

import { cn } from "@/lib/utils";
import type { UICorrection } from "./types";

const CLASS = { grammar: "u-grammar", clarity: "u-clarity", tone: "u-tone" } as const;

// Render the user's text with non-overlapping colored underlines for each
// non-dismissed correction. Click a span → activate its card (two-way sync).
export function AnnotatedView({
  text,
  corrections,
  activeId,
  onActivate,
}: {
  text: string;
  corrections: UICorrection[];
  activeId: string | null;
  onActivate: (id: string) => void;
}) {
  const spans = corrections
    .filter((c) => c.status !== "dismissed")
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const c of spans) {
    if (c.start < cursor) continue; // safety: skip overlaps
    if (c.start > cursor) parts.push(text.slice(cursor, c.start));
    parts.push(
      <mark
        key={c.id}
        id={`span-${c.id}`}
        onClick={() => onActivate(c.id)}
        className={cn(
          "cursor-pointer bg-transparent text-inherit",
          CLASS[c.category],
          c.severity === "suggestion" && "u-suggestion",
          activeId === c.id && "u-active"
        )}
        title={c.rule_tag}
      >
        {text.slice(c.start, c.end)}
      </mark>
    );
    cursor = c.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <div className="whitespace-pre-wrap text-[17px] leading-[1.7]">{parts}</div>
  );
}
