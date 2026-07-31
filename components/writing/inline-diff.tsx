"use client";

import { diffWords } from "diff";

// Natural-rewrite diff: red strike = removed, green = added (Spec §3.1). ~inline, not side-by-side.
export function InlineDiff({ original, rewrite }: { original: string; rewrite: string }) {
  // An unchanged rewrite is the expected outcome for a clean draft — say so
  // rather than rendering the text twice with nothing highlighted.
  if (original.trim() === rewrite.trim())
    return (
      <p className="text-sm text-muted-foreground">
        Already natural — a native colleague would send this as it is.
      </p>
    );
  const parts = diffWords(original, rewrite);
  return (
    <div className="whitespace-pre-wrap text-[16px] leading-[1.7]">
      {parts.map((p, i) => {
        if (p.added)
          return (
            <span key={i} className="rounded bg-green-500/15 text-green-700 dark:text-green-400">
              {p.value}
            </span>
          );
        if (p.removed)
          return (
            <span key={i} className="text-red-600/80 line-through dark:text-red-400/80">
              {p.value}
            </span>
          );
        return <span key={i}>{p.value}</span>;
      })}
    </div>
  );
}
