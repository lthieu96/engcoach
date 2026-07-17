// Per-dimension score trend across completed interviews (docs/04 §3.4) — the
// "am I getting better?" view. Hand-rolled SVG server component, no client JS,
// matching components/dashboard/charts.tsx.
import { Card, CardContent } from "@/components/ui/card";
import { KIND_LABEL, RUBRICS, DIMENSION_LABEL, type InterviewKind } from "@/lib/interview";

export type TrendPoint = { date: string; scores: Record<string, number> };

function DimensionLine({ label, values }: { label: string; values: (number | null)[] }) {
  const w = 220;
  const h = 40;
  const pad = 4;
  const n = values.length;
  const x = (i: number) => (n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad));
  const y = (v: number) => h - pad - ((v - 1) / 3) * (h - 2 * pad); // fixed 1..4 domain
  const pts = values.map((v, i) => (v == null ? null : { x: x(i), y: y(v), v, i })).filter(Boolean) as {
    x: number;
    y: number;
    v: number;
    i: number;
  }[];
  if (!pts.length) return null;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const latest = pts.at(-1)!.v;

  return (
    <div className="text-primary">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">now {latest}/4</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
        {/* Bar reference line: score 3 = at the bar */}
        <line
          x1={0}
          x2={w}
          y1={y(3)}
          y2={y(3)}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.25}
          vectorEffect="non-scaling-stroke"
        />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {pts.map((p) => (
          <circle key={p.i} cx={p.x} cy={p.y} r={2.5} fill="currentColor" />
        ))}
      </svg>
    </div>
  );
}

export function ScoreTrend({ kind, points }: { kind: InterviewKind; points: TrendPoint[] }) {
  if (points.length < 2) return null; // a trend needs at least two sessions
  const dims = RUBRICS[kind].map((d) => d.id);
  // Coding is optional per-session (DSA with pasted code) — include it if it ever appears.
  if (points.some((p) => p.scores.coding != null)) dims.push("coding");

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">{KIND_LABEL[kind]} trend</h2>
          <span className="text-xs text-muted-foreground">
            {points.length} interviews · dashed line = hire bar
          </span>
        </div>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {dims.map((d) => (
            <DimensionLine
              key={d}
              label={DIMENSION_LABEL[d] ?? d}
              values={points.map((p) => p.scores[d] ?? null)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
