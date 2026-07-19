import { useEffect, useMemo, useState } from "react";

// Live implied-win-probability chart for a real market's three outcomes (Home / Draw / Away).
// Every point is a REAL demargined TxLINE price sampled as it streams in - nothing is synthesised.
// History accumulates for the session (kept per fixture across route changes); until enough
// samples exist the lines are simply flat at the current price.

const OUT_COLORS = ["#4f7cff", "#f6b73c", "#f2685f"]; // Home / Draw / Away
const SAMPLE_MS = 15_000; // heartbeat sample so quiet periods still advance the x-axis
const MAX_POINTS = 360;   // ~90 min of heartbeat samples

type Probs = [number, number, number];
interface Sample { t: number; v: Probs }

// Session-scoped history per fixture (module-level so navigating away and back keeps the trace).
const HISTORY = new Map<number, Sample[]>();

function implied(odds?: [number, number, number] | null): Probs | null {
  if (!odds || !odds.some((o) => o > 0)) return null;
  const raw = odds.map((o) => (o > 0 ? 1 / o : 0));
  const s = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((x) => (x / s) * 100) as Probs;
}

const code = (name: string) => (name || "").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "?";

export function LiveProbChart({ odds, homeTeam, awayTeam, seed = 1 }: {
  odds?: [number, number, number] | null; homeTeam: string; awayTeam: string; seed?: number;
}) {
  const target = implied(odds);
  const [, bump] = useState(0); // re-render tick when a sample lands

  // Record real samples: immediately when the price changes, plus a heartbeat so time passes
  // visibly between price moves. No synthetic jitter - repeated samples of an unchanged price
  // draw a flat segment, because that IS the market.
  useEffect(() => {
    if (!target) return;
    const buf = HISTORY.get(seed) ?? [];
    HISTORY.set(seed, buf);
    const push = () => {
      const cur = implied(odds);
      if (!cur) return;
      buf.push({ t: Date.now(), v: cur });
      if (buf.length > MAX_POINTS) buf.splice(0, buf.length - MAX_POINTS);
      bump((x) => x + 1);
    };
    push();
    const id = setInterval(push, SAMPLE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, target?.[0], target?.[1], target?.[2]]);

  const samples = HISTORY.get(seed) ?? [];
  const flat = !target;
  const last: Probs = target ?? [33.34, 33.33, 33.33];
  // Need at least 2 samples for a trace; otherwise draw a level line at the current price.
  const pts: Sample[] = samples.length >= 2 ? samples : [
    { t: Date.now() - 60_000, v: last }, { t: Date.now(), v: last },
  ];

  // ─── geometry ───
  const W = 740, H = 300, padL = 16, padR = 70, padT = 24, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = pts.flatMap((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 6) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
  lo -= 2; hi += 2;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const xt = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const yv = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (i / 4) * (hi - lo));

  // de-overlap the three end labels
  const endsSorted = [0, 1, 2].map((k) => ({ k, y: yv(last[k]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < 3; i++) if (endsSorted[i].y - endsSorted[i - 1].y < 24) endsSorted[i].y = endsSorted[i - 1].y + 24;
  const labelY: Record<number, number> = {};
  endsSorted.forEach((e) => (labelY[e.k] = e.y));

  const xLabels = useMemo(() => [0.12, 0.5, 0.86].map((f) => ({
    x: padL + f * plotW,
    txt: new Date(t0 + f * (t1 - t0)).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  })), [t0, t1, plotW]);

  const labels = [code(homeTeam), "DRAW", code(awayTeam)];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {!flat && <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulseDot" />}
          Implied win probability
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {flat ? "no prices yet" : samples.length >= 2 ? `${samples.length} live samples · TxLINE demargined` : "tracing live prices…"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yv(t)} y2={yv(t)} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" className="text-muted-foreground" />
            <text x={W - padR + 8} y={yv(t) + 3} className="fill-muted-foreground" fontSize="11">{Math.round(t)}%</text>
          </g>
        ))}

        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="11">{l.txt}</text>
        ))}

        {[0, 1, 2].map((k) => (
          <polyline key={k} fill="none" stroke={OUT_COLORS[k]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" points={pts.map((p) => `${xt(p.t).toFixed(1)},${yv(p.v[k]).toFixed(1)}`).join(" ")} />
        ))}

        {[0, 1, 2].map((k) => (
          <g key={k}>
            <circle cx={xt(t1)} cy={yv(last[k])} r="9" fill={OUT_COLORS[k]} opacity="0.18" />
            <circle cx={xt(t1)} cy={yv(last[k])} r="4.5" fill={OUT_COLORS[k]} />
            <text x={xt(t1) + 12} y={labelY[k] - 3} fontSize="12" fontWeight="700" fill={OUT_COLORS[k]}>{labels[k]}</text>
            <text x={xt(t1) + 12} y={labelY[k] + 11} fontSize="12" fontWeight="700" className="fill-foreground">{Math.round(last[k])}%</text>
          </g>
        ))}
      </svg>

      {flat && (
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          No TxLINE odds for this fixture yet - probabilities stay level until prices arrive.
        </p>
      )}
    </div>
  );
}
