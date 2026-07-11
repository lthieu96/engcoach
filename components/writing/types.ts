import type { Category, RuleTag } from "@/lib/taxonomy";

// Row shape /api/correct returns (DB rows — the route fails hard if persistence fails,
// so ids are always real).
export type SavedCorrection = {
  id: string;
  span_start: number;
  span_end: number;
  original: string;
  replacement: string;
  category: Category;
  rule_tag: RuleTag;
  severity: "error" | "suggestion";
  explanation: string;
  status: "pending" | "accepted" | "dismissed";
};

export type UICorrection = Omit<SavedCorrection, "span_start" | "span_end"> & {
  start: number;
  end: number;
};

export function toUICorrection(c: SavedCorrection): UICorrection {
  const { span_start, span_end, ...rest } = c;
  return { ...rest, start: span_start, end: span_end };
}
