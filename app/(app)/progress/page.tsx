// Phase 3 — Dashboard (Plan §3.4). One page, no gamification beyond the heatmap.
import { LayersTwo01 as Layers, Target01 as Target, Edit03 as PenLine } from "@untitledui/icons";
import { createClient } from "@/lib/supabase/server";
import { countByDay, retention, wordCount, trendByCategory, topTags } from "@/lib/stats";
import { StatTile, Heatmap, MiniTrend, TopErrors } from "@/components/dashboard/charts";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const supabase = await createClient();
  const now = new Date();
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 864e5).toISOString();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [logs, docs, corr, due, weekDocs] = await Promise.all([
    supabase.from("review_logs").select("rating, reviewed_at").gte("reviewed_at", iso(182)),
    supabase.from("documents").select("created_at").gte("created_at", iso(182)),
    supabase.from("corrections").select("rule_tag, created_at").gte("created_at", iso(56)),
    supabase.from("cards").select("id", { count: "exact", head: true }).lte("due", now.toISOString()),
    supabase.from("documents").select("original_text").gte("created_at", weekStart.toISOString()),
  ]);

  const reviewLogs = logs.data ?? [];
  const corrections = corr.data ?? [];

  // Heatmap: reviews + writing sessions per day.
  const heat = countByDay([
    ...reviewLogs.map((l) => l.reviewed_at),
    ...(docs.data ?? []).map((d) => d.created_at),
  ]);

  const retain = retention(reviewLogs.filter((l) => l.reviewed_at >= iso(30)));
  const words = (weekDocs.data ?? []).reduce((n, d) => n + wordCount(d.original_text), 0);

  const trend = trendByCategory(corrections, now, 8);
  const monthTop = topTags(
    corrections.filter((c) => c.created_at >= iso(30)),
    now,
    5,
    6
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Progress</h1>
        <p className="text-sm text-muted-foreground">Your practice, retention and error trends.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Due today"
          value={String(due.count ?? 0)}
          sub="cards to review"
          icon={<Layers />}
        />
        <StatTile
          label="Retention 30d"
          value={retain == null ? "—" : `${retain}%`}
          sub="reviews passed"
          icon={<Target />}
        />
        <StatTile label="Words written" value={String(words)} sub="this week" icon={<PenLine />} />
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="mb-3 text-sm font-medium">Activity — last 6 months</h2>
        <Heatmap counts={heat} />
        <p className="mt-2 text-xs text-muted-foreground">Reviews + writing sessions per day.</p>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="mb-3 text-sm font-medium">Error rate by category — last 8 weeks</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniTrend label="Grammar" values={trend.grammar} category="grammar" />
          <MiniTrend label="Clarity" values={trend.clarity} category="clarity" />
          <MiniTrend label="Tone" values={trend.tone} category="tone" />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="mb-3 text-sm font-medium">Top errors this month</h2>
        <TopErrors rows={monthTop} />
      </section>
    </div>
  );
}
