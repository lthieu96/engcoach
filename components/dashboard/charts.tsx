// Hand-rolled dashboard charts (no chart dependency). Server components — the
// only interactivity is native `title` tooltips, so no client JS ships.
import { dayKey, heatLevel } from "@/lib/stats";

const CAT_VAR = {
  grammar: "--cat-grammar",
  clarity: "--cat-clarity",
  tone: "--cat-tone",
} as const;

export function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{label}</div>
        {icon && (
          <span className="flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs [&>svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// GitHub-style activity calendar: columns = weeks, rows = Sun→Sat.
export function Heatmap({ counts, weeks = 26 }: { counts: Map<string, number>; weeks?: number }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (weeks - 1) * 7 - today.getDay());

  const cols: ({ key: string; c: number; level: number } | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: ({ key: string; c: number; level: number } | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > today) {
        col.push(null);
      } else {
        const c = counts.get(dayKey(date)) ?? 0;
        col.push({ key: dayKey(date), c, level: heatLevel(c) });
      }
    }
    cols.push(col);
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {cols.map((col, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {col.map((cell, j) =>
            cell ? (
              <div
                key={j}
                title={`${cell.key}: ${cell.c} activit${cell.c === 1 ? "y" : "ies"}`}
                className={`size-[11px] rounded-[2px] hm-${cell.level}`}
              />
            ) : (
              <div key={j} className="size-[11px]" />
            )
          )}
        </div>
      ))}
    </div>
  );
}

// One small-multiple area chart (single hue) — 3 of these replace a 3-line chart
// that blue/purple can't pass CVD separation on.
export function MiniTrend({
  label,
  values,
  category,
}: {
  label: string;
  values: number[];
  category: keyof typeof CAT_VAR;
}) {
  const w = 240;
  const h = 44;
  const pad = 2;
  const n = values.length;
  const max = Math.max(1, ...values);
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <div style={{ color: `var(${CAT_VAR[category]})` }}>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {total} in {n}w · now {values[n - 1]}/wk
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-11 w-full">
        <path d={area} fill="currentColor" opacity={0.15} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  const w = 64;
  const h = 18;
  const n = values.length;
  const max = Math.max(1, ...values);
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - 1 - (v / max) * (h - 2);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-4 w-16 text-muted-foreground">
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const DOT = { grammar: "bg-(--cat-grammar)", clarity: "bg-(--cat-clarity)", tone: "bg-(--cat-tone)" };

export function TopErrors({
  rows,
}: {
  rows: { tag: string; count: number; category: keyof typeof DOT; spark: number[] }[];
}) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">No errors logged this month.</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.tag} className="flex items-center gap-3 py-2 text-sm">
          <span className={`size-2 shrink-0 rounded-full ${DOT[r.category]}`} />
          <span className="flex-1 font-medium">{r.tag}</span>
          <Sparkline values={r.spark} />
          <span className="w-8 text-right tabular-nums text-muted-foreground">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
