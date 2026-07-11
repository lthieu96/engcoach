"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Terminal-style braille spinner (the classic CLI look).
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function AsciiSpinner({ label, className }: { label?: string; className?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("inline-flex items-center gap-2 font-mono text-sm", className)}
    >
      <span aria-hidden>{FRAMES[i]}</span>
      {label && <span>{label}</span>}
    </span>
  );
}
