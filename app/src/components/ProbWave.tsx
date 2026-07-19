import { useId } from "react";

/**
 * A gradient probability area-chart. A smooth signal line is coloured across its width by the
 * Home / Draw / Away split (blue → amber → red), with a soft vertical gradient fill beneath and a
 * subtle glow. The wider a colour runs, the more likely that outcome. Pass implied probabilities.
 */
export function ProbWave({
  probs, height = 44, animated = false, className = "",
}: { probs?: [number, number, number] | null; height?: number; animated?: boolean; className?: string }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, "");
  const gradId = "pwg" + uid, fadeId = "pwf" + uid, glowId = "pwb" + uid;
  if (!probs || !probs.some((p) => p > 0)) return null;

  const [h, d, a] = probs;
  const tot = h + d + a || 1;
  const b1 = (h / tot) * 100;
  const b2 = ((h + d) / tot) * 100;

  const HOME = "#5b86ff", DRAW = "#f6b73c", AWAY = "#f2685f";
  // A smooth three-hump wave across 0..100 that dips toward the boundaries (reads as a "signal").
  const line = "M0,26 C 10,12 20,12 30,20 C 40,28 48,28 58,16 C 68,6 78,8 88,18 C 93,22 97,22 100,20";
  const area = `${line} L100,40 L0,40 Z`;

  return (
    <svg className={"block w-full overflow-visible " + className} viewBox="0 0 100 40" preserveAspectRatio="none" style={{ height }} aria-hidden>
      <defs>
        {/* horizontal colour split */}
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={HOME} /><stop offset={`${b1}%`} stopColor={HOME} />
          <stop offset={`${b1}%`} stopColor={DRAW} /><stop offset={`${b2}%`} stopColor={DRAW} />
          <stop offset={`${b2}%`} stopColor={AWAY} /><stop offset="100%" stopColor={AWAY} />
        </linearGradient>
        {/* vertical fade for the fill */}
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={glowId}><rect x="0" y="0" width="100" height="40" fill={`url(#${fadeId})`} /></mask>
      </defs>

      <g className={animated ? "animate-wave" : undefined}>
        {/* vertically-faded, horizontally-coloured fill */}
        <g mask={`url(#${glowId})`}>
          <path d={area} fill={`url(#${gradId})`} />
        </g>
        {/* glow underlay + crisp line */}
        <path d={line} fill="none" stroke={`url(#${gradId})`} strokeWidth="3.4" strokeLinecap="round" opacity="0.35" style={{ filter: "blur(2.5px)" }} />
        <path d={line} fill="none" stroke={`url(#${gradId})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* faint horizontal gridlines for a proper "chart" read */}
      {[13, 26].map((y) => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="hsl(var(--foreground))" strokeOpacity="0.05" strokeWidth="0.5" strokeDasharray="1.5 2.5" />
      ))}
      {/* boundary markers where one outcome hands off to the next */}
      <line x1={b1} y1="6" x2={b1} y2="38" stroke="hsl(var(--foreground))" strokeOpacity="0.1" strokeWidth="0.5" />
      <line x1={b2} y1="6" x2={b2} y2="38" stroke="hsl(var(--foreground))" strokeOpacity="0.1" strokeWidth="0.5" />
      {/* glowing endpoint marker */}
      <circle cx="100" cy="20" r="1.7" fill={AWAY} />
      <circle cx="100" cy="20" r="3.4" fill={AWAY} opacity="0.35" style={{ filter: "blur(1.5px)" }} />
    </svg>
  );
}
