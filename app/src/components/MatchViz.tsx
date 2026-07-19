import { useEffect, useRef, useState } from "react";
import { Flag } from "./Flag";

// A lightweight live "match tracker" like sports-betting sites: a top-down pitch with 11 dots per
// team drifting in formation and chasing the ball, the ball wandering toward the attacking third,
// and a GOAL! burst whenever the score ticks up. Driven by the replay frame (minute/score/status).

const W = 1020, H = 612;
const MX = 39, MY = 30;
const PX = MX, PY = MY, PW = W - 2 * MX, PH = H - 2 * MY;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// 4-3-3 as pitch fractions (x: 0 left..1 right, attacking right; y: 0 top..1 bottom)
const FORM: [number, number][] = [
  [0.05, 0.5],
  [0.2, 0.16], [0.2, 0.39], [0.2, 0.61], [0.2, 0.84],
  [0.4, 0.28], [0.4, 0.5], [0.4, 0.72],
  [0.62, 0.22], [0.66, 0.5], [0.62, 0.78],
];

interface Props {
  minute: number; home: number; away: number; status: string; playing: boolean;
  homeTeam: string; awayTeam: string;
}

export function MatchViz({ minute, home, away, status, playing, homeTeam, awayTeam }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [flash, setFlash] = useState<null | "home" | "away">(null);
  const prev = useRef({ home, away });
  const sim = useRef<any>(null);
  const playRef = useRef(playing);
  playRef.current = playing;

  if (!sim.current) {
    const team = (side: 1 | -1) => FORM.map(([fx, fy]) => {
      const x = side === 1 ? fx : 1 - fx;
      return { bx: x, by: fy, x: PX + x * PW, y: PY + fy * PH, ph: rand(0, 6.28) };
    });
    sim.current = { home: team(1), away: team(-1), ball: { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2 }, poss: 1, t: 0 };
  }

  // goal detection -> flash + send the ball to the scored-on goal
  useEffect(() => {
    let who: "home" | "away" | null = null;
    if (home > prev.current.home) who = "home";
    else if (away > prev.current.away) who = "away";
    prev.current = { home, away };
    if (!who) return;
    setFlash(who);
    const b = sim.current.ball;
    b.tx = who === "home" ? PX + PW - 12 : PX + 12;
    b.ty = H / 2 + rand(-33, 33);
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [home, away]);

  // snap back to formation when the replay is reset to kickoff (minute 0, not playing)
  useEffect(() => {
    if (playing || minute !== 0) return;
    const s = sim.current;
    [...s.home, ...s.away].forEach((p: any) => { p.x = PX + p.bx * PW; p.y = PY + p.by * PH; });
    s.ball.x = W / 2; s.ball.y = H / 2; s.ball.tx = W / 2; s.ball.ty = H / 2; s.poss = 1;
  }, [minute, playing]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const drawPitch = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#12a15a"); g.addColorStop(1, "#0c8348");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)";
        ctx.fillRect(PX + (PW / 8) * i, PY, PW / 8, PH);
      }
      ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3;
      ctx.strokeRect(PX, PY, PW, PH);
      ctx.beginPath(); ctx.moveTo(W / 2, PY); ctx.lineTo(W / 2, PY + PH); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 69, 0, 6.283); ctx.stroke();
      const bw = 99, bh = 252;
      ctx.strokeRect(PX, H / 2 - bh / 2, bw, bh);
      ctx.strokeRect(PX + PW - bw, H / 2 - bh / 2, bw, bh);
      const gh = 81;
      ctx.strokeRect(PX - 7, H / 2 - gh / 2, 7, gh);
      ctx.strokeRect(PX + PW, H / 2 - gh / 2, 7, gh);
    };
    const dot = (x: number, y: number, col: string) => {
      ctx.beginPath(); ctx.arc(x, y, 9.5, 0, 6.283); ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 2; ctx.stroke();
    };

    const step = () => {
      const s = sim.current, b = s.ball;
      // The tracker is always drawn, but only moves while the match is actually playing.
      if (playRef.current) {
        s.t += 1;
        b.x += (b.tx - b.x) * 0.055; b.y += (b.ty - b.y) * 0.055;
        if (Math.hypot(b.tx - b.x, b.ty - b.y) < 13) {
          if (Math.random() < 0.28) s.poss *= -1;
          const atk = s.poss === 1 ? rand(0.5, 0.96) : rand(0.04, 0.5);
          b.tx = PX + atk * PW; b.ty = PY + rand(0.14, 0.86) * PH;
        }
        const move = (arr: any[]) => arr.forEach((p) => {
          const wx = Math.sin(s.t * 0.02 + p.ph) * 13, wy = Math.cos(s.t * 0.024 + p.ph) * 13;
          let tx = PX + p.bx * PW + wx, ty = PY + p.by * PH + wy;
          const d = Math.hypot(b.x - (PX + p.bx * PW), b.y - (PY + p.by * PH));
          if (d < 140) { tx += (b.x - tx) * 0.32; ty += (b.y - ty) * 0.32; }
          p.x += (tx - p.x) * 0.08; p.y += (ty - p.y) * 0.08;
        });
        move(s.home); move(s.away);
      }

      drawPitch();
      s.home.forEach((p: any) => dot(p.x, p.y, "#2563eb"));
      s.away.forEach((p: any) => dot(p.x, p.y, "#ef4444"));
      ctx.beginPath(); ctx.arc(b.x, b.y, 6.5, 0, 6.283); ctx.fillStyle = "#fff"; ctx.fill();
      ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const clock = status === "FT" ? "FT" : status === "UPCOMING" ? "0'" : `${minute}'`;
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <canvas ref={ref} width={W} height={H} className="block w-full" />
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
        <span className="inline-flex items-center gap-1"><Flag team={homeTeam} /> {homeTeam}</span>
        <span className="tnum rounded bg-white/15 px-1.5">{home} : {away}</span>
        <span className="inline-flex items-center gap-1">{awayTeam} <Flag team={awayTeam} /></span>
        <span className="tnum ml-1 opacity-80">{clock}</span>
      </div>
      <div className="absolute right-3 top-3 hidden items-center gap-2 text-[10px] font-medium text-white/90 sm:flex">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#2563eb" }} /> {homeTeam}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#ef4444" }} /> {awayTeam}</span>
      </div>
      {flash && (
        <div className="absolute inset-0 grid place-items-center bg-black/40">
          <div className="text-center" style={{ animation: "goalpop .4s ease-out" }}>
            <style>{"@keyframes goalpop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}"}</style>
            <div className="font-display text-5xl font-black tracking-tight text-white drop-shadow-lg">GOAL!</div>
            <div className="mt-1 text-sm font-semibold text-white/90">{flash === "home" ? homeTeam : awayTeam}</div>
          </div>
        </div>
      )}
    </div>
  );
}
