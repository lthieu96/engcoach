"use client";

import { Check, XClose as X, Plus } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/lib/taxonomy";
import type { UICorrection } from "./types";

// Same CSS vars as the underlines in globals.css — dot and underline always match.
const DOT = {
  grammar: "bg-(--cat-grammar)",
  clarity: "bg-(--cat-clarity)",
  tone: "bg-(--cat-tone)",
} as const;

export function CorrectionCard({
  c,
  active,
  onActivate,
  onAccept,
  onDismiss,
  onAddCard,
  addingCard,
}: {
  c: UICorrection;
  active: boolean;
  onActivate: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onAddCard: () => void;
  addingCard: boolean;
}) {
  const accepted = c.status === "accepted";
  return (
    <div
      id={`card-${c.id}`}
      onClick={onActivate}
      className={cn(
        "cursor-pointer rounded-lg border p-3 text-sm transition-colors",
        active && "ring-2 ring-primary",
        accepted && "opacity-70",
        c.severity === "error" ? "bg-card" : "bg-muted/40"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("size-2 rounded-full", DOT[c.category])} />
        <Badge variant="outline" className="text-[10px] font-normal">
          {CATEGORY_LABEL[c.category]} · {c.rule_tag}
        </Badge>
        {c.severity === "error" && (
          <span className="text-[10px] font-medium text-red-600 dark:text-red-400">error</span>
        )}
      </div>
      <p className="leading-snug">
        <span className="text-muted-foreground line-through">{c.original}</span>{" "}
        <span className="font-semibold">{c.replacement}</span>
      </p>
      <p className="mt-1 text-muted-foreground">{c.explanation}</p>
      <div className="mt-2 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!accepted ? (
          <>
            <Button size="sm" variant="secondary" className="h-7" onClick={onAccept}>
              <Check className="size-3.5" /> Accept
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={onDismiss}>
              <X className="size-3.5" /> Dismiss
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7" onClick={onAddCard} disabled={addingCard}>
            <Plus className="size-3.5" /> {addingCard ? "Adding…" : "Flashcard"}
          </Button>
        )}
      </div>
    </div>
  );
}
