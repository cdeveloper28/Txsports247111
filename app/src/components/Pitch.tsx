import { useId } from "react";

const HOME = "#4f7cff", DRAW = "#f6b73c", AWAY = "#f2685f";
const LINE = "rgba(255,255,255,0.11)";

/**
 * Top-down pitch illustration where the colour wash is real data: home/draw/away implied
 * probability mapped to pitch territory (home attacks left→right), with the ball sitting
 * at the centre of the expected-result zone.
 */
export function Pitch({
  probs,
  live = false,
  className = "",
}: {
  probs?: [number, number, number] | null;
  live?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gid = "terr" + uid;

  const norm =
    probs && probs.some((p) => p > 0)
      ? (() => {
          const t = probs[0] + probs[1] + probs[2] || 1;
          return [(probs[0] / t) * 100, (probs[1] / t) * 100, (probs[2] / t) * 100] as const;
        })()
      : null;
  const b1 = norm ? norm[0] : 33.3;
  const b2 = norm ? norm[0] + norm[1] : 66.6;

  const X0 = 6, X1 = 214, W = X1 - X0;
  const ballX = X0 + W * ((b1 + b2) / 200);
  const f = 6; // gradient feather between territories

  return (
    <svg viewBox="0 0 220 100" preserveAspectRatio="none" className={"block h-full w-full " + className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={HOME} stopOpacity="0.17" />
          <stop offset={`${Math.max(b1 - f, 0)}%`} stopColor={HOME} stopOpacity="0.10" />
          <stop offset={`${Math.min(b1 + f, 100)}%`} stopColor={DRAW} stopOpacity="0.06" />
          <stop offset={`${Math.max(b2 - f, 0)}%`} stopColor={DRAW} stopOpacity="0.06" />
          <stop offset={`${Math.min(b2 + f, 100)}%`} stopColor={AWAY} stopOpacity="0.10" />
          <stop offset="100%" stopColor={AWAY} stopOpacity="0.17" />
        </linearGradient>
      </defs>

      {/* mowing stripes */}
      {Array.from({ length: 8 }).map((_, i) =>
        i % 2 ? (
          <rect key={i} x={X0 + (W / 8) * i} y={6} width={W / 8} height={88} fill="rgba(255,255,255,0.018)" />
        ) : null
      )}

      {/* probability territory */}
      {norm && <rect x={X0} y={6} width={W} height={88} fill={`url(#${gid})`} />}

      {/* line work */}
      <g fill="none" stroke={LINE} strokeWidth="1" vectorEffect="non-scaling-stroke">
        <rect x={X0} y={6} width={W} height={88} rx="2" />
        <line x1="110" y1="6" x2="110" y2="94" />
        <circle cx="110" cy="50" r="13" />
        {/* penalty areas + six-yard boxes */}
        <rect x={X0} y={24} width={33} height={52} />
        <rect x={X1 - 33} y={24} width={33} height={52} />
        <rect x={X0} y={38} width={11} height={24} />
        <rect x={X1 - 11} y={38} width={11} height={24} />
        {/* penalty Ds */}
        <path d={`M ${X0 + 33} 40 A 12 12 0 0 1 ${X0 + 33} 60`} />
        <path d={`M ${X1 - 33} 40 A 12 12 0 0 0 ${X1 - 33} 60`} />
        {/* corner arcs */}
        <path d={`M ${X0} 12 A 6 6 0 0 0 ${X0 + 6} 6`} />
        <path d={`M ${X1 - 6} 6 A 6 6 0 0 0 ${X1} 12`} />
        <path d={`M ${X1} 88 A 6 6 0 0 0 ${X1 - 6} 94`} />
        <path d={`M ${X0 + 6} 94 A 6 6 0 0 0 ${X0} 88`} />
      </g>

      {/* spots */}
      <circle cx="110" cy="50" r="1.2" fill={LINE} />
      <circle cx={X0 + 22} cy="50" r="1" fill={LINE} />
      <circle cx={X1 - 22} cy="50" r="1" fill={LINE} />

      {/* the ball - sits at the centre of the expected-result zone */}
      {norm && (
        <g className={live ? "animate-pulseDot" : undefined}>
          <circle cx={ballX} cy="50" r="6" fill="#fff" opacity="0.1" />
          <circle cx={ballX} cy="50" r="2.3" fill="#fff" opacity="0.9" />
        </g>
      )}
    </svg>
  );
}
