// Pure aggregation helpers for the dashboard (Plan §3.4). No IO — unit-tested.
import { TAG_CATEGORY, type Category } from "./taxonomy";

/** Local YYYY-MM-DD key for a timestamp (heatmap buckets by local day). */
export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/** Count events per local day. */
export function countByDay(timestamps: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of timestamps) m.set(dayKey(t), (m.get(dayKey(t)) ?? 0) + 1);
  return m;
}

/** GitHub-style intensity bucket 0–4 for a day's activity count. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** True retention %: pass = rating ≥ 2 (Again is the only fail). Spec §4. */
export function retention(logs: { rating: number }[]): number | null {
  if (!logs.length) return null;
  const pass = logs.filter((l) => l.rating >= 2).length;
  return Math.round((pass / logs.length) * 100);
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Bucket timestamps into `weeks` trailing 7-day windows ending at `now`.
 * Returns index 0 = oldest week … weeks-1 = current week, or -1 if out of range.
 */
export function weekBucket(ts: string, now: Date, weeks: number): number {
  const days = (now.getTime() - new Date(ts).getTime()) / 864e5;
  if (days < 0 || days >= weeks * 7) return -1;
  return weeks - 1 - Math.floor(days / 7);
}

/** Per-category weekly error counts over the trailing `weeks` window. */
export function trendByCategory(
  corrections: { rule_tag: string; created_at: string }[],
  now: Date,
  weeks: number
): Record<Category, number[]> {
  const out: Record<Category, number[]> = {
    grammar: Array(weeks).fill(0),
    clarity: Array(weeks).fill(0),
    tone: Array(weeks).fill(0),
  };
  for (const c of corrections) {
    const w = weekBucket(c.created_at, now, weeks);
    if (w < 0) continue;
    const cat = TAG_CATEGORY[c.rule_tag as keyof typeof TAG_CATEGORY] ?? "clarity";
    out[cat][w] += 1;
  }
  return out;
}

/** Top-N rule_tags by count, with a trailing weekly sparkline each. */
export function topTags(
  corrections: { rule_tag: string; created_at: string }[],
  now: Date,
  n: number,
  sparkWeeks: number
): { tag: string; count: number; category: Category; spark: number[] }[] {
  const groups = new Map<string, { rule_tag: string; created_at: string }[]>();
  for (const c of corrections) {
    const arr = groups.get(c.rule_tag) ?? [];
    arr.push(c);
    groups.set(c.rule_tag, arr);
  }
  return [...groups.entries()]
    .map(([tag, rows]) => {
      const spark = Array(sparkWeeks).fill(0);
      for (const r of rows) {
        const w = weekBucket(r.created_at, now, sparkWeeks);
        if (w >= 0) spark[w] += 1;
      }
      return {
        tag,
        count: rows.length,
        category: TAG_CATEGORY[tag as keyof typeof TAG_CATEGORY] ?? "clarity",
        spark,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
