type Frame = { minute: number; odds: [number, number, number]; status: string };

const HOME = "#4f7cff", DRAW = "#f6b73c", AWAY = "#f2685f";

/** 100%-stacked win-probability over the match (Home blue / Draw amber / Away red), from the feed's
 * per-minute odds, with a marker at the current replay minute. */
export function WinProbChart({ frames, currentMinute, height = 120 }: {
  frames: Frame[]; currentMinute: number; height?: number;
}) {
  if (!frames || frames.length < 2 || !frames.some((f) => f.odds?.some((o) => o > 0))) return null;
  const W = 600, H = 140;
  const maxMin = Math.max(1, ...frames.map((f) => f.minute), 90);
  const x = (m: number) => (Math.min(m, maxMin) / maxMin) * W;
  const yTop = (cum: number) => H - cum * H;

  const probs = frames.map((f) => {
    const p = f.odds.map((o) => (o > 0 ? 1 / o : 0));
    const s = p.reduce((a, b) => a + b, 0) || 1;
    return p.map((v) => v / s);
  });

  const band = (lo: (p: number[]) => number, hi: (p: number[]) => number) => {
    const top = frames.map((f, i) => `${i ? "L" : "M"}${x(f.minute).toFixed(1)},${yTop(hi(probs[i])).toFixed(1)}`).join(" ");
    const bot = frames.map((f, i) => ({ f, i })).reverse()
      .map(({ f, i }) => `L${x(f.minute).toFixed(1)},${yTop(lo(probs[i])).toFixed(1)}`).join(" ");
    return `${top} ${bot} Z`;
  };

  const cx = x(currentMinute);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={band(() => 0, (p) => p[0])} fill={HOME} opacity="0.9" />
      <path d={band((p) => p[0], (p) => p[0] + p[1])} fill={DRAW} opacity="0.85" />
      <path d={band((p) => p[0] + p[1], () => 1)} fill={AWAY} opacity="0.9" />
      <line x1={cx} x2={cx} y1="0" y2={H} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
